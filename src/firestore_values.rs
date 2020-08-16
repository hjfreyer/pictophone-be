// Modified from https://docs.rs/crate/firestore-db-and-auth/0.5.0/source/src/firebase_rest_to_rust.rs
//
// Licensed under MIT: https://github.com/davidgraeff/firestore-db-and-auth-rs/blob/master/LICENSE

//! # Low Level API to convert between rust types and the Firebase REST API
//! Low level API to convert between generated rust types (see [`crate::dto`]) and
//! the data types of the Firebase REST API. Those are 1:1 translations of the grpc API
//! and deeply nested and wrapped.

use serde::{Deserialize, Serialize};
use serde_json as sj;
use sj::json;
use std::collections::HashMap;

use crate::proto::google::firestore::v1 as fs;

#[derive(Debug)]
pub enum DeserializeError {
    EmptyValue,
    InvalidFloat,
    Serde(serde_json::error::Error),
}

impl From<serde_json::error::Error> for DeserializeError {
    fn from(err: serde_json::error::Error) -> DeserializeError {
        DeserializeError::Serde(err)
    }
}

/// Converts a firebase google-rpc-api inspired heavily nested and wrapped response value
/// of the Firebase REST API into a flattened serde json value.
///
/// This is a low level API. You probably want to use [`crate::documents`] instead.
///
/// This method works recursively!
pub fn firebase_value_to_serde_value(v: &fs::Value) -> Result<sj::Value, DeserializeError> {
    use fs::value::ValueType;

    let value_type = v.value_type.as_ref().ok_or(DeserializeError::EmptyValue)?;

    match value_type {
        ValueType::NullValue(_) => Ok(sj::Value::Null),
        &ValueType::BooleanValue(b) => Ok(sj::Value::Bool(b)),
        &ValueType::IntegerValue(i) => Ok(sj::Value::Number(i.into())),
        &ValueType::DoubleValue(d) => sj::Number::from_f64(d)
            .ok_or(DeserializeError::InvalidFloat)
            .map(sj::Value::Number),
        ValueType::TimestampValue(_) => unimplemented!(),
        ValueType::BytesValue(_) => unimplemented!(),
        ValueType::ReferenceValue(_) => unimplemented!(),
        ValueType::GeoPointValue(_) => unimplemented!(),
        ValueType::StringValue(s) => Ok(sj::Value::String(s.to_owned())),
        ValueType::ArrayValue(array_value) => {
            let converted: Result<Vec<sj::Value>, DeserializeError> = array_value
                .values
                .iter()
                .map(firebase_value_to_serde_value)
                .collect();
            Ok(sj::Value::Array(converted?))
        }
        ValueType::MapValue(map_value) => {
            let converted: Result<sj::Map<String, sj::Value>, DeserializeError> = map_value
                .fields
                .iter()
                .map(|(k, v)| firebase_value_to_serde_value(v).map(|cv| (k.to_owned(), cv)))
                .collect();

            Ok(sj::Value::Object(converted?))
        }
    }
}

#[derive(Debug)]
pub enum SerializeError {
    InvalidNumber,
    InvalidDocument,
    Serde(serde_json::error::Error),
}

impl From<serde_json::error::Error> for SerializeError {
    fn from(err: serde_json::error::Error) -> SerializeError {
        SerializeError::Serde(err)
    }
}

/// Converts a flat serde json value into a firebase google-rpc-api inspired heavily nested and wrapped type
/// to be consumed by the Firebase REST API.
///
/// This is a low level API. You probably want to use [`crate::documents`] instead.
///
/// This method works recursively!
pub(crate) fn serde_value_to_firebase_value(v: &sj::Value) -> Result<fs::Value, SerializeError> {
    use fs::value::ValueType;
    let inner = match v {
        sj::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(ValueType::IntegerValue(i))
            } else if let Some(f) = n.as_f64() {
                Ok(ValueType::DoubleValue(f))
            } else {
                Err(SerializeError::InvalidNumber)
            }
        }
        &sj::Value::Null => Ok(ValueType::NullValue(0)),
        &sj::Value::Bool(b) => Ok(ValueType::BooleanValue(b)),
        sj::Value::String(s) => Ok(ValueType::StringValue(s.clone())),
        sj::Value::Array(v) => {
            let mapped: Result<Vec<fs::Value>, SerializeError> =
                v.iter().map(serde_value_to_firebase_value).collect();
            Ok(ValueType::ArrayValue(fs::ArrayValue { values: mapped? }))
        }
        sj::Value::Object(v) => {
            let mapped: Result<HashMap<String, fs::Value>, SerializeError> = v
                .iter()
                .map(|(k, v)| serde_value_to_firebase_value(v).map(|v| (k.to_owned(), v)))
                .collect();
            Ok(ValueType::MapValue(fs::MapValue { fields: mapped? }))
        }
    };
    Ok(fs::Value {
        value_type: Some(inner?),
    })
}

/// Converts a firebase google-rpc-api inspired heavily nested and wrapped response document
/// of the Firebase REST API into a given custom type.
///
/// This is a low level API. You probably want to use [`crate::documents`] instead.
///
/// Internals:
///
/// This method uses recursion to decode the given firebase type.
pub fn from_document<T>(document: &fs::Document) -> Result<T, DeserializeError>
where
    for<'de> T: Deserialize<'de>,
{
    let converted: Result<sj::Map<String, sj::Value>, DeserializeError> = document
        .fields
        .iter()
        .map(|(k, v)| firebase_value_to_serde_value(v).map(|cv| (k.to_owned(), cv)))
        .collect();

    let v = sj::Value::Object(converted?);

    Ok(serde_json::from_value::<T>(v)?)
}

/// Converts a custom data type into a firebase google-rpc-api inspired heavily nested and wrapped type
/// to be consumed by the Firebase REST API.
///
/// This is a low level API. You probably want to use [`crate::documents`] instead.
///
/// Internals:
///
/// This method uses recursion to decode the given firebase type.
pub fn to_document<T>(pod: &T) -> Result<HashMap<String, fs::Value>, SerializeError>
where
    T: Serialize,
{
    let v = serde_value_to_firebase_value(&serde_json::to_value(pod)?)?;
    if let Some(fs::value::ValueType::MapValue(m)) = v.value_type {
        Ok(m.fields)
    } else {
        Err(SerializeError::InvalidDocument)
    }
}
