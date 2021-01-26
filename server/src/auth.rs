// Taken from yup_oauth2.
// TODO: figure out a better home.

//! This module provides a token source (`GetToken`) that obtains tokens for service accounts.
//! Service accounts are usually used by software (i.e., non-human actors) to get access to
//! resources. Currently, this module only works with RS256 JWTs, which makes it at least suitable for
//! authentication with Google services.
//!
//! Resources:
//! - [Using OAuth 2.0 for Server to Server
//! Applications](https://developers.google.com/identity/protocols/OAuth2ServiceAccount)
//! - [JSON Web Tokens](https://jwt.io/)
//!
//! Copyright (c) 2016 Google Inc (lewinb@google.com).
//!

use log::{error, info, trace, warn};
use std::{io, time};

use anyhow::bail;
use rustls::{
    self,
    internal::pemfile,
    sign::{self, SigningKey},
    PrivateKey,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct Token {
    pub token: String,
    pub expiration: time::SystemTime,
}

#[tonic::async_trait]
pub trait Source {
    async fn token(&self) -> anyhow::Result<Token>;
}

#[tonic::async_trait]
impl<S: Source + Send + Sync + ?Sized> Source for Box<S> {
    async fn token(&self) -> anyhow::Result<Token> {
        S::token(self).await
    }
}

const GOOGLE_RS256_HEAD: &str = r#"{"alg":"RS256","typ":"JWT"}"#;

/// Encodes s as Base64
fn append_base64<T: AsRef<[u8]> + ?Sized>(s: &T, out: &mut String) {
    base64::encode_config_buf(s, base64::URL_SAFE, out)
}

/// Decode a PKCS8 formatted RSA key.
fn decode_rsa_key(pem_pkcs8: &str) -> Result<PrivateKey, io::Error> {
    let private_keys = pemfile::pkcs8_private_keys(&mut pem_pkcs8.as_bytes());

    match private_keys {
        Ok(mut keys) if !keys.is_empty() => {
            keys.truncate(1);
            Ok(keys.remove(0))
        }
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Not enough private keys in PEM",
        )),
        Err(_) => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Error reading key from PEM",
        )),
    }
}

/// JSON schema of secret service account key. You can obtain the key from
/// the Cloud Console at https://console.cloud.google.com/.
///
/// You can use `helpers::read_service_account_key()` as a quick way to read a JSON client
/// secret into a ServiceAccountKey.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServiceAccountKey {
    #[serde(rename = "type")]
    /// key_type
    pub key_type: Option<String>,
    /// project_id
    pub project_id: Option<String>,
    /// private_key_id
    pub private_key_id: Option<String>,
    /// private_key
    pub private_key: String,
    /// client_email
    pub client_email: String,
    /// client_id
    pub client_id: Option<String>,
    /// auth_uri
    pub auth_uri: Option<String>,
    /// token_uri
    pub token_uri: String,
    /// auth_provider_x509_cert_url
    pub auth_provider_x509_cert_url: Option<String>,
    /// client_x509_cert_url
    pub client_x509_cert_url: Option<String>,
}

/// Permissions requested for a JWT.
/// See https://developers.google.com/identity/protocols/OAuth2ServiceAccount#authorizingrequests.
#[derive(Serialize, Debug)]
struct Claims<'a> {
    iss: &'a str,
    aud: &'a str,
    exp: u64,
    iat: u64,
    #[serde(rename = "sub")]
    subject: Option<&'a str>,
    scope: String,
}

fn unix_time_secs(t: time::SystemTime) -> u64 {
    t.duration_since(time::SystemTime::UNIX_EPOCH)
        // If for some weird reason the system time is before the unix epoch...
        // just set the time to 0 and let the remote server figure out what to
        // do about that. Seems better than panicking.
        .unwrap_or_default()
        .as_secs()
}

impl<'a> Claims<'a> {
    fn new<T>(
        key: &'a ServiceAccountKey,
        audience: &'a str,
        scopes: &[T],
    ) -> (Self, time::SystemTime)
    where
        T: AsRef<str>,
    {
        use itertools::Itertools;
        let now = time::SystemTime::now();
        let expiry = now + time::Duration::from_secs(3600);

        let scope = scopes.iter().map(|t| t.as_ref().to_owned()).join(" ");
        (
            Claims {
                iss: &key.client_email,
                aud: audience,
                exp: unix_time_secs(expiry),
                iat: unix_time_secs(now),
                subject: Some(&key.client_email),
                scope,
            },
            expiry,
        )
    }
}

/// A JSON Web Token ready for signing.
pub(crate) struct JWTSigner {
    signer: Box<dyn rustls::sign::Signer>,
}

impl JWTSigner {
    fn new(private_key: &str) -> Result<Self, io::Error> {
        let key = decode_rsa_key(private_key)?;
        let signing_key = sign::RSASigningKey::new(&key)
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "Couldn't initialize signer"))?;
        let signer = signing_key
            .choose_scheme(&[rustls::SignatureScheme::RSA_PKCS1_SHA256])
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::Other, "Couldn't choose signing scheme")
            })?;
        Ok(JWTSigner { signer })
    }

    fn sign_claims(&self, claims: &Claims) -> Result<String, rustls::TLSError> {
        let mut jwt_head = Self::encode_claims(claims);
        let signature = self.signer.sign(jwt_head.as_bytes())?;
        jwt_head.push_str(".");
        append_base64(&signature, &mut jwt_head);
        Ok(jwt_head)
    }

    /// Encodes the first two parts (header and claims) to base64 and assembles them into a form
    /// ready to be signed.
    fn encode_claims(claims: &Claims) -> String {
        let mut head = String::new();
        append_base64(GOOGLE_RS256_HEAD, &mut head);
        head.push_str(".");
        append_base64(&serde_json::to_string(&claims).unwrap(), &mut head);
        head
    }
}

pub struct ServiceAccountTokenSource {
    key: ServiceAccountKey,
    signer: JWTSigner,
    audience: String,
    scopes: Vec<String>,
}

impl ServiceAccountTokenSource {
    pub fn new(
        key: ServiceAccountKey,
        audience: String,
        scopes: Vec<String>,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            signer: JWTSigner::new(&key.private_key)?,
            key,
            audience,
            scopes,
        })
    }
}

#[tonic::async_trait]
impl Source for ServiceAccountTokenSource {
    async fn token(&self) -> anyhow::Result<Token> {
        let (claims, expiry) = Claims::new(&self.key, &self.audience, &self.scopes);
        let signed = self.signer.sign_claims(&claims)?;
        Ok(Token {
            token: signed,
            expiration: expiry,
        })
    }
}

pub struct InstanceTokenSource {
    scopes: Vec<String>,
}

impl InstanceTokenSource {
    pub fn new(scopes: Vec<String>) -> anyhow::Result<Self> {
        Ok(Self { scopes })
    }
}

const URL: &str =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

#[derive(Deserialize, Debug)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    token_type: String,
}

#[tonic::async_trait]
impl Source for InstanceTokenSource {
    async fn token(&self) -> anyhow::Result<Token> {
        let response = ureq::get(URL)
            .query("scopes", &self.scopes.join(","))
            .set("Metadata-Flavor", "Google")
            .call();
        if !response.ok() {
            bail!("bad response from auth")
        }

        let response: TokenResponse = serde_json::from_str(&response.into_string()?)?;
        Ok(Token {
            token: response.access_token,
            expiration: time::SystemTime::now() + time::Duration::from_secs(response.expires_in),
        })
    }
}

pub struct CachedTokenSource<S> {
    source: S,
    cache: RwLock<Option<Token>>,
}

impl<S: Source> CachedTokenSource<S> {
    pub fn new(source: S) -> Self {
        Self {
            source,
            cache: RwLock::new(None),
        }
    }

    pub async fn token(&self) -> anyhow::Result<Token> {
        {
            let lock = self.cache.read().await;
            if let Some(token) = lock.as_ref() {
                if time::SystemTime::now() < token.expiration - time::Duration::from_secs(5 * 60) {
                    return Ok(token.clone());
                }
            }
        }
        // If we've made it here, the token isn't suitable for some reason. Get a new one.
        // TODO: potential thundering herd issue here. Shrug.
        {
            info!("Refreshing auth token.");
            let mut lock = self.cache.write().await;
            let token = self.source.token().await?;
            *lock = Some(token.clone());
            info!("Refreshed auth token. Expires: {:?}", token.expiration);
            Ok(token)
        }
    }
}
