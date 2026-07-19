import express from 'express';
import { performance } from 'perf_hooks';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import { CODE_VERSION } from '@/config';
import {
  createProfilingConnection,
  deleteProfilingConnection,
  getProfilingConnectionById,
  getProfilingConnectionsByTeam,
  updateProfilingConnection,
} from '@/controllers/profilingConnection';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import { recordOperationOutcome } from '@/utils/instrumentation';
import { objectIdSchema } from '@/utils/zod';

import {
  buildProfilingAuthorization,
  profilingProxyHandler,
} from './profilingProxy';

const authTypeSchema = z.enum(['none', 'basic', 'bearer']);
const CONNECTION_TEST_OPERATION = 'pyroscope.connection_test';

const connectionSettingsSchema = z
  .object({
    endpoint: z.string().url(),
    tenantId: z.string().trim().max(150).optional(),
    authType: authTypeSchema,
    username: z.string().max(200).optional(),
    secret: z.string().max(10_000).optional(),
  })
  .superRefine((value, context) => {
    const url = new URL(value.endpoint);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endpoint'],
        message:
          'Endpoint must be an HTTP(S) URL without credentials, query, or hash',
      });
    }
    if (value.authType === 'basic' && !value.username) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['username'],
        message: 'Username is required for basic authentication',
      });
    }
  });

const connectionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    endpoint: z.string().url(),
    tenantId: z.string().trim().max(150).optional(),
    authType: authTypeSchema,
    username: z.string().max(200).optional(),
    secret: z.string().max(10_000).optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    const url = new URL(value.endpoint);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endpoint'],
        message:
          'Endpoint must be an HTTP(S) URL without credentials, query, or hash',
      });
    }
    if (value.authType === 'basic' && !value.username) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['username'],
        message: 'Username is required for basic authentication',
      });
    }
  });

const router = express.Router();

function serializeConnection(connection: {
  _id: { toString(): string };
  name: string;
  endpoint: string;
  tenantId?: string;
  authType: 'none' | 'basic' | 'bearer';
  username?: string;
  enabled: boolean;
}) {
  return {
    id: connection._id.toString(),
    name: connection.name,
    endpoint: connection.endpoint,
    tenantId: connection.tenantId,
    authType: connection.authType,
    username: connection.username,
    hasSecret: connection.authType !== 'none',
    enabled: connection.enabled,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);
    const connections = await getProfilingConnectionsByTeam(teamId.toString());
    res.json(connections.map(serializeConnection));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/test',
  validateRequest({
    body: connectionSettingsSchema.and(
      z.object({ connectionId: objectIdSchema.optional() }),
    ),
  }),
  async (req, res, next) => {
    const startedAt = performance.now();
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      let secret = req.body.secret;

      if (req.body.connectionId && !secret) {
        const existing = await getProfilingConnectionById(
          teamId.toString(),
          req.body.connectionId,
          true,
        );
        if (!existing) {
          res.sendStatus(404);
          return;
        }
        if (existing.authType === req.body.authType) {
          secret = existing.secret;
        }
      }

      if (req.body.authType !== 'none' && !secret) {
        res.status(400).json({
          success: false,
          error: 'Secret is required for authentication',
        });
        return;
      }

      const endpoint = req.body.endpoint.endsWith('/')
        ? req.body.endpoint
        : `${req.body.endpoint}/`;
      const headers: Record<string, string> = {
        accept: 'application/json',
        'user-agent': `hyperdx ${CODE_VERSION}`,
      };
      if (req.body.tenantId) {
        headers['x-scope-orgid'] = req.body.tenantId;
      }
      const authorization = buildProfilingAuthorization(
        req.body.authType,
        req.body.username,
        secret,
      );
      if (authorization) headers.authorization = authorization;

      const upstream = await fetch(
        new URL('api/v1/status/buildinfo', endpoint),
        {
          headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(5_000),
        },
      );
      const outcome = upstream.ok ? 'success' : 'error';
      recordOperationOutcome({
        operation: CONNECTION_TEST_OPERATION,
        outcome,
        durationMs: performance.now() - startedAt,
      });
      if (!upstream.ok) {
        res.status(502).json({
          success: false,
          error: `Pyroscope returned HTTP ${upstream.status}`,
        });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      recordOperationOutcome({
        operation: CONNECTION_TEST_OPERATION,
        outcome: 'error',
        durationMs: performance.now() - startedAt,
      });
      if (error instanceof TypeError || error instanceof DOMException) {
        res.status(502).json({
          success: false,
          error: 'Unable to connect to Pyroscope',
        });
        return;
      }
      next(error);
    }
  },
);

router.post(
  '/',
  validateRequest({ body: connectionBodySchema }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      if (req.body.authType !== 'none' && !req.body.secret) {
        res
          .status(400)
          .json({ error: 'Secret is required for authentication' });
        return;
      }
      const connection = await createProfilingConnection(teamId.toString(), {
        ...req.body,
        enabled: req.body.enabled ?? true,
      });
      res.status(201).json(serializeConnection(connection));
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id',
  validateRequest({
    params: z.object({ id: objectIdSchema }),
    body: connectionBodySchema,
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const existing = await getProfilingConnectionById(
        teamId.toString(),
        req.params.id,
        true,
      );
      if (!existing) {
        res.sendStatus(404);
        return;
      }
      if (
        req.body.authType !== 'none' &&
        existing.authType !== req.body.authType &&
        !req.body.secret
      ) {
        res
          .status(400)
          .json({ error: 'Secret is required for authentication' });
        return;
      }
      const update = {
        ...req.body,
        enabled: req.body.enabled ?? true,
        ...(req.body.secret ? { secret: req.body.secret } : {}),
      };
      const connection = await updateProfilingConnection(
        teamId.toString(),
        req.params.id,
        update,
        req.body.authType === 'none' ? ['secret', 'username'] : [],
      );
      res.json(serializeConnection(connection!));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  validateRequest({ params: z.object({ id: objectIdSchema }) }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const deleted = await deleteProfilingConnection(
        teamId.toString(),
        req.params.id,
      );
      res.sendStatus(deleted ? 204 : 404);
    } catch (error) {
      next(error);
    }
  },
);

router.use(
  '/:id/proxy',
  validateRequest({ params: z.object({ id: objectIdSchema }) }),
  profilingProxyHandler,
);

export default router;
