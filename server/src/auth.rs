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

use std::{io, time};

use rustls::{
    self,
    internal::pemfile,
    sign::{self, SigningKey},
    PrivateKey,
};
use serde::{Deserialize, Serialize};
// use url::form_urlencoded;

const GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:jwt-bearer";
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

impl<'a> Claims<'a> {
    fn new<T>(key: &'a ServiceAccountKey, scopes: &[T], subject: Option<&'a str>) -> Self
    where
        T: AsRef<str>,
    {
        // If for some weird reason the system time is before the unix epoch...
        // just set the time to 0 and let the remote server figure out what to
        // do about that. Seems better than panicking.
        let now = time::SystemTime::now()
            .duration_since(time::SystemTime::UNIX_EPOCH)
            .unwrap_or_else(|_| time::Duration::from_secs(0));
        let expiry = now + time::Duration::from_secs(3600);
        use itertools::Itertools;

        let scope = scopes.iter().map(|t| t.as_ref().to_owned()).join(" ");
        Claims {
            iss: &key.client_email,
            aud: &"https://firestore.googleapis.com/",
            exp: expiry.as_secs(),
            iat: now.as_secs(),
            subject: Some(&key.client_email),
            scope,
        }
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
        println!("CLAIMS: {:?}", claims);
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

pub struct ServiceAccountFlowOpts {
    pub(crate) key: ServiceAccountKey,
    pub(crate) subject: Option<String>,
}

/// ServiceAccountFlow can fetch oauth tokens using a service account.
pub struct ServiceAccountFlow {
    key: ServiceAccountKey,
    subject: Option<String>,
    signer: JWTSigner,
}

impl ServiceAccountFlow {
    pub(crate) fn new(opts: ServiceAccountFlowOpts) -> Result<Self, io::Error> {
        let signer = JWTSigner::new(&opts.key.private_key)?;
        Ok(ServiceAccountFlow {
            key: opts.key,
            subject: opts.subject,
            signer,
        })
    }

    /// Send a request for a new Bearer token to the OAuth provider.
    pub(crate) fn token<T>(&self, scopes: &[T]) -> Result<String, anyhow::Error>
    where
        T: AsRef<str>,
    {
        let claims = Claims::new(&self.key, scopes, self.subject.as_ref().map(|x| x.as_str()));
        let signed = self.signer.sign_claims(&claims)?;
        Ok(signed)
    }
}
