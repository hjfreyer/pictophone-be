/* tslint:disable */
// generated by typescript-json-validator
import Ajv = require('ajv');
import {Strand, Entry, View, Timestamp} from './log';
import {inspect} from 'util';
export interface KoaContext {
  readonly request?: unknown; // {body?: unknown}
  readonly params?: unknown;
  readonly query?: unknown;
  throw(status: 400, message: string): unknown;
}
export const ajv = new Ajv({"allErrors":true,"coerceTypes":false,"format":"fast","nullable":true,"unicode":true,"uniqueItems":true,"useDefaults":true});

ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));

export {Strand, Entry, View, Timestamp};
export const Schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "Entry": {
      "defaultProperties": [
      ],
      "properties": {
        "time": {
          "defaultProperties": [
          ],
          "properties": {
            "nanoseconds": {
              "type": "number"
            },
            "seconds": {
              "type": "number"
            }
          },
          "required": [
            "nanoseconds",
            "seconds"
          ],
          "type": "object"
        }
      },
      "required": [
        "time"
      ],
      "type": "object"
    },
    "Strand": {
      "defaultProperties": [
      ],
      "properties": {
        "views": {
          "additionalProperties": {
            "type": "number"
          },
          "defaultProperties": [
          ],
          "type": "object"
        }
      },
      "required": [
        "views"
      ],
      "type": "object"
    },
    "Timestamp": {
      "defaultProperties": [
      ],
      "properties": {
        "nanoseconds": {
          "type": "number"
        },
        "seconds": {
          "type": "number"
        }
      },
      "required": [
        "nanoseconds",
        "seconds"
      ],
      "type": "object"
    },
    "View": {
      "defaultProperties": [
      ],
      "properties": {
        "body": {
          "type": "string"
        }
      },
      "required": [
        "body"
      ],
      "type": "object"
    }
  }
};
ajv.addSchema(Schema, 'Schema')
export function validateKoaRequest(typeName: 'View'): (ctx: KoaContext) => {
  params: unknown,
  query: unknown,
  body: View['body'],
};
export function validateKoaRequest(typeName: string): (ctx: KoaContext) => {
  params: unknown,
  query: unknown,
  body: unknown,
};
export function validateKoaRequest(typeName: string): (ctx: KoaContext) => {
  params: any,
  query: any,
  body: any,
} {
  const params = ajv.getSchema(`Schema#/definitions/${typeName}/properties/params`);
  const query = ajv.getSchema(`Schema#/definitions/${typeName}/properties/query`);
  const body = ajv.getSchema(`Schema#/definitions/${typeName}/properties/body`);
  const validateProperty = (
    prop: string,
    validator: any,
    ctx: KoaContext,
  ): any => {
    const data = prop === 'body' ? ctx.request && (ctx.request as any).body : (ctx as any)[prop];
    if (validator) {
      const valid = validator(data);
  
      if (!valid) {
        ctx.throw(
          400,
          'Invalid request: ' + ajv.errorsText(validator.errors!.filter((e: any) => e.keyword !== 'if'), {dataVar: prop}) + '\n\n' + inspect({params: ctx.params, query: ctx.query, body: ctx.request && (ctx.request as any).body}),
        );
      }
    }
    return data;
  };
  return (ctx) => {
    return {
      params: validateProperty('params', params, ctx),
      query: validateProperty('query', query, ctx),
      body: validateProperty('body', body, ctx),
    }
  };
}
export function validate(typeName: 'Strand'): (value: unknown) => Strand;
export function validate(typeName: 'Entry'): (value: unknown) => Entry;
export function validate(typeName: 'View'): (value: unknown) => View;
export function validate(typeName: 'Timestamp'): (value: unknown) => Timestamp;
export function validate(typeName: string): (value: unknown) => any {
  const validator: any = ajv.getSchema(`Schema#/definitions/${typeName}`);
  return (value: unknown): any => {
    if (!validator) {
      throw new Error(`No validator defined for Schema#/definitions/${typeName}`)
    }
  
    const valid = validator(value);

    if (!valid) {
      throw new Error(
        'Invalid ' + typeName + ': ' + ajv.errorsText(validator.errors!.filter((e: any) => e.keyword !== 'if'), {dataVar: typeName}),
      );
    }

    return value as any;
  };
}