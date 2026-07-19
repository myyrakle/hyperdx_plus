import type { ProfilingAuthType } from '@hyperdx/common-utils/dist/types';
import mongoose, { Schema } from 'mongoose';

type ObjectId = mongoose.Types.ObjectId;

export interface IProfilingConnection {
  _id: ObjectId;
  team: ObjectId;
  name: string;
  endpoint: string;
  tenantId?: string;
  authType: ProfilingAuthType;
  username?: string;
  secret?: string;
  enabled: boolean;
}

export type ProfilingConnectionDocument =
  mongoose.HydratedDocument<IProfilingConnection>;

const ProfilingConnectionSchema = new Schema<IProfilingConnection>(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Team',
      index: true,
    },
    name: { type: String, required: true },
    endpoint: { type: String, required: true },
    tenantId: String,
    authType: {
      type: String,
      enum: ['none', 'basic', 'bearer'],
      required: true,
      default: 'none',
    },
    username: String,
    secret: { type: String, select: false },
    enabled: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

export default mongoose.model<IProfilingConnection>(
  'ProfilingConnection',
  ProfilingConnectionSchema,
);
