import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

@Schema({ timestamps: true, collection: 'api_keys' })
export class ApiKey {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  keyPrefix: string;

  @Prop({ required: true })
  hashedKey: string;

  @Prop({ type: [String], default: [] })
  scopes: string[];

  @Prop({ required: false })
  expiresAt: Date;

  @Prop({ required: false })
  revokedAt: Date;

  @Prop({ required: false })
  lastUsedAt: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

