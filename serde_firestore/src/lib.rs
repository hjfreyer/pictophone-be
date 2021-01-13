use std::fmt::Display;

use serde::{
    de::{self, IntoDeserializer, MapAccess, SeqAccess, Visitor},
    forward_to_deserialize_any, ser, Deserialize,
};

use googapis::google::firestore::v1 as dto;

#[derive(Debug, thiserror::Error)]
#[error("error converting: {0}")]
pub struct Error(String);

impl ser::Error for Error {
    fn custom<T: Display>(msg: T) -> Self {
        Self(msg.to_string())
    }
}

impl de::Error for Error {
    fn custom<T: Display>(msg: T) -> Self {
        Self(msg.to_string())
    }
}

pub struct Serializer {}

pub struct Deserializer<'de> {
    input: &'de dto::Value,
}

struct ArrayWrap<'de> {
    // de: &'a mut Deserializer<'de>,
    iter: std::slice::Iter<'de, dto::Value>,
}

impl<'de> SeqAccess<'de> for ArrayWrap<'de> {
    type Error = Error;

    fn next_element_seed<T>(&mut self, seed: T) -> Result<Option<T::Value>, Self::Error>
    where
        T: de::DeserializeSeed<'de>,
    {
        match self.iter.next() {
            Some(value) => seed.deserialize(Deserializer { input: value }).map(Some),
            None => Ok(None),
        }
    }
}

struct MapWrap<'de> {
    iter: std::collections::hash_map::Iter<'de, String, dto::Value>,
    next_value: Option<&'de dto::Value>,
}

impl<'de> MapAccess<'de> for MapWrap<'de> {
    type Error = Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>, Self::Error>
    where
        K: de::DeserializeSeed<'de>,
    {
        match self.iter.next() {
            None => Ok(None),
            Some((key, value)) => {
                self.next_value = Some(value);
                seed.deserialize(key.to_owned().into_deserializer())
                    .map(Some)
            }
        }
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value, Self::Error>
    where
        V: de::DeserializeSeed<'de>,
    {
        let next_value = self.next_value.unwrap();
        seed.deserialize(Deserializer { input: next_value })
    }
}

impl<'de, 'a> de::Deserializer<'de> for Deserializer<'de> {
    type Error = Error;

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Error>
    where
        V: Visitor<'de>,
    {
        match self.input.value_type.as_ref().ok_or(Error("".to_owned()))? {
            dto::value::ValueType::NullValue(_) => visitor.visit_none(),
            dto::value::ValueType::BooleanValue(b) => visitor.visit_bool(*b),
            dto::value::ValueType::IntegerValue(i) => visitor.visit_i64(*i),
            dto::value::ValueType::DoubleValue(d) => visitor.visit_f64(*d),
            dto::value::ValueType::TimestampValue(_) => Err(Error("".to_owned())),
            dto::value::ValueType::StringValue(s) => visitor.visit_string(s.to_owned()),
            dto::value::ValueType::BytesValue(b) => visitor.visit_byte_buf(b.to_owned()),
            dto::value::ValueType::ReferenceValue(_) => Err(Error("".to_owned())),
            dto::value::ValueType::GeoPointValue(_) => Err(Error("".to_owned())),
            dto::value::ValueType::ArrayValue(array) => visitor.visit_seq(ArrayWrap {
                // de: self,
                iter: array.values.iter(),
            }),
            dto::value::ValueType::MapValue(map) => visitor.visit_map(MapWrap {
                iter: map.fields.iter(),
                next_value: None,
            }),
        }
    }

    forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string
        bytes byte_buf option unit unit_struct newtype_struct seq tuple
        tuple_struct map struct enum identifier ignored_any
    }
}

pub fn from_doc<'a, T>(doc: &'a dto::Document) -> Result<T, Error>
where
    T: Deserialize<'a>,
{
    T::deserialize(DocDeserializer { doc })
}

pub struct DocDeserializer<'de> {
    doc: &'de dto::Document,
}

impl<'de, 'a> de::Deserializer<'de> for DocDeserializer<'de> {
    type Error = Error;

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Error>
    where
        V: Visitor<'de>,
    {
        visitor.visit_map(MapWrap {
            iter: self.doc.fields.iter(),
            next_value: None,
        })
    }

    forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string
        bytes byte_buf option unit unit_struct newtype_struct seq tuple
        tuple_struct map struct enum identifier ignored_any
    }
}

#[cfg(test)]
mod test {
    use maplit::hashmap;
    use serde::Deserialize;

    use super::*;
    #[test]
    fn deserialize_primitives() {
        use serde::Deserialize;
        {
            let value = dto::Value {
                value_type: Some(dto::value::ValueType::IntegerValue(42)),
            };
            let d = Deserializer { input: &value };

            let x = i64::deserialize(d).unwrap();
            assert_eq!(x, 42);
        }
    }

    #[test]
    fn deserialize_empty_array() {
        use serde::Deserialize;
        {
            let value = dto::Value {
                value_type: Some(dto::value::ValueType::ArrayValue(dto::ArrayValue {
                    values: vec![],
                })),
            };
            let d = Deserializer { input: &value };

            let x = Vec::<bool>::deserialize(d).unwrap();
            assert_eq!(x, Vec::<bool>::new());
        }
    }

    #[test]
    fn deserialize_array() {
        use serde::Deserialize;
        {
            let value = dto::Value {
                value_type: Some(dto::value::ValueType::ArrayValue(dto::ArrayValue {
                    values: vec![
                        dto::Value {
                            value_type: Some(dto::value::ValueType::IntegerValue(4)),
                        },
                        dto::Value {
                            value_type: Some(dto::value::ValueType::IntegerValue(8)),
                        },
                        dto::Value {
                            value_type: Some(dto::value::ValueType::IntegerValue(15)),
                        },
                    ],
                })),
            };
            let d = Deserializer { input: &value };

            let x = Vec::<i64>::deserialize(d).unwrap();
            assert_eq!(x, vec![4, 8, 15]);
        }
    }

    #[test]
    fn deserialize_struct() {
        #[derive(Debug, Eq, PartialEq, Deserialize)]
        struct Test {
            name: String,
            rank: Option<String>,
            serial_number: i64,
        }
        {
            let value = dto::Value {
                value_type: Some(dto::value::ValueType::MapValue(dto::MapValue {
                    fields: hashmap![
                        "name".to_owned() => dto::Value {
                            value_type: Some(dto::value::ValueType::StringValue("bond, james".to_owned())),
                        },
                        "rank".to_owned() =>   dto::Value {
                            value_type: Some(dto::value::ValueType::NullValue(0)),
                        },
                        "serial_number".to_owned() =>   dto::Value {
                            value_type: Some(dto::value::ValueType::IntegerValue(7)),
                        },
                    ],
                })),
            };
            let d = Deserializer { input: &value };

            let x = Test::deserialize(d).unwrap();
            assert_eq!(
                x,
                Test {
                    name: "bond, james".to_owned(),
                    rank: None,
                    serial_number: 7,
                }
            );
        }
    }
}

// Borrowed from davidgraeff/firestore-db-and-auth-rs
//
// pub(crate) fn firebase_value_to_serde_value(value: &dto::Value) -> Result<serde_json::Value, ConversionError> {
//     match value.value_type.ok_or(ConversionError())? {
//         dto::value::ValueType::NullValue(_) => serde_json::Value::Null,
//         dto::value::ValueType::BooleanValue(b) => serde_json::Value::Bool(b),
//         dto::value::ValueType::IntegerValue(i) => serde_json::Value::Number(serde_json::Number::from(i)),
//         dto::value::ValueType::DoubleValue(_) => {}
//         dto::value::ValueType::TimestampValue(_) => {}
//         dto::value::ValueType::StringValue(_) => {}
//         dto::value::ValueType::BytesValue(_) => {}
//         dto::value::ValueType::ReferenceValue(_) => {}
//         dto::value::ValueType::GeoPointValue(_) => {}
//         dto::value::ValueType::ArrayValue(_) => {}
//         dto::value::ValueType::MapValue(_) => {}
//     }

//     if let Some(timestamp_value) = v.timestamp_value.as_ref() {
//         return Value::String(timestamp_value.clone());
//     } else if let Some(integer_value) = v.integer_value.as_ref() {
//         if let Ok(four) = integer_value.parse::<i64>() {
//             return Value::Number(four.into());
//         }
//     } else if let Some(double_value) = v.double_value {
//         if let Some(dd) = Number::from_f64(double_value) {
//             return Value::Number(dd);
//         }
//     } else if let Some(map_value) = v.map_value.as_ref() {
//         let mut map: Map<String, serde_json::value::Value> = Map::new();
//         if let Some(map_fields) = &map_value.fields {
//             for (map_key, map_v) in map_fields {
//                 map.insert(map_key.clone(), firebase_value_to_serde_value(&map_v));
//             }
//         }
//         return Value::Object(map);
//     } else if let Some(string_value) = v.string_value.as_ref() {
//         return Value::String(string_value.clone());
//     } else if let Some(boolean_value) = v.boolean_value {
//         return Value::Bool(boolean_value);
//     } else if let Some(array_value) = v.array_value.as_ref() {
//         let mut vec: Vec<Value> = Vec::new();
//         if let Some(values) = &array_value.values {
//             for k in values {
//                 vec.push(firebase_value_to_serde_value(&k));
//             }
//         }
//         return Value::Array(vec);
//     }
//     Value::Null
// }

// /// Converts a flat serde json value into a firebase google-rpc-api inspired heavily nested and wrapped type
// /// to be consumed by the Firebase REST API.
// ///
// /// This is a low level API. You probably want to use [`crate::documents`] instead.
// ///
// /// This method works recursively!
// pub(crate) fn serde_value_to_firebase_value(v: &serde_json::Value) -> dto::Value {
//     if v.is_f64() {
//         return dto::Value {
//             double_value: Some(v.as_f64().unwrap()),
//             ..Default::default()
//         };
//     } else if let Some(integer_value) = v.as_i64() {
//         return dto::Value {
//             integer_value: Some(integer_value.to_string()),
//             ..Default::default()
//         };
//     } else if let Some(map_value) = v.as_object() {
//         let mut map: HashMap<String, dto::Value> = HashMap::new();
//         for (map_key, map_v) in map_value {
//             map.insert(map_key.to_owned(), serde_value_to_firebase_value(&map_v));
//         }
//         return dto::Value {
//             map_value: Some(dto::MapValue { fields: Some(map) }),
//             ..Default::default()
//         };
//     } else if let Some(string_value) = v.as_str() {
//         return dto::Value {
//             string_value: Some(string_value.to_owned()),
//             ..Default::default()
//         };
//     } else if let Some(boolean_value) = v.as_bool() {
//         return dto::Value {
//             boolean_value: Some(boolean_value),
//             ..Default::default()
//         };
//     } else if let Some(array_value) = v.as_array() {
//         let mut vec: Vec<dto::Value> = Vec::new();
//         for k in array_value {
//             vec.push(serde_value_to_firebase_value(&k));
//         }
//         return dto::Value {
//             array_value: Some(dto::ArrayValue { values: Some(vec) }),
//             ..Default::default()
//         };
//     }
//     Default::default()
// }
