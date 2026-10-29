// Derive payload descriptions from the same Zod validators used by API routes.
import { z } from 'zod';
import {
  registerSchema,
  loginSchema,
  tokenSchema,
  resetSchema,
} from './routes/auth.js';
import { organizationSchema } from './routes/organizations.js';
import { listingFields, searchSchema, categories } from './services/schemas.js';
import { parseInput } from './ai/parser.js';
import { pagination, objectId } from './middleware/auth.js';
const empty = z.object({}).strict();
const json = (schema) =>
  z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const schemas = {
  Register: registerSchema,
  Login: loginSchema,
  Token: tokenSchema,
  Reset: resetSchema,
  Organization: organizationSchema,
  OrganizationPatch: organizationSchema.partial(),
  Listing: listingFields,
  ParseInput: parseInput,
  Empty: empty,
  Claim: z.object({ listingId: objectId }).strict(),
  Pickup: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
  Feedback: z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(1000).default(''),
    })
    .strict(),
  Verify: z
    .object({
      status: z.enum(['approved', 'rejected']),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  Forgot: z.object({ email: z.string().email().max(254) }).strict(),
  DeleteAccount: z
    .object({
      password: z.string().min(1).max(72),
      confirmation: z.literal('DELETE'),
    })
    .strict(),
  UserState: z.object({ disabled: z.boolean() }).strict(),
  Moderation: z.object({ reason: z.string().min(3).max(500) }).strict(),
};
const paths = {};
function add(
  method,
  path,
  summary,
  { body, query, publicRoute = false, created = false, description = '' } = {},
) {
  const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: json(objectId),
  }));
  if (query) {
    const q = json(query);
    for (const [name, schema] of Object.entries(q.properties || {}))
      parameters.push({
        name,
        in: 'query',
        required: (q.required || []).includes(name),
        schema,
      });
  }
  const operation = {
    summary,
    description,
    tags: [path.split('/')[1]],
    security: publicRoute ? [] : [{ bearerAuth: [] }],
    parameters,
    responses: {
      [created ? '201' : '200']: {
        description:
          'Success envelope: {success:true,data:<resource or paginated items>}',
        content: { 'application/json': { schema: ref('Success') } },
      },
      400: {
        description: 'Strict validation failure',
        content: { 'application/json': { schema: ref('Error') } },
      },
      401: { description: 'Missing/invalid authentication or token' },
      403: { description: 'Role, approval, origin or ownership denied' },
      404: { description: 'Resource not found' },
      409: { description: 'Lifecycle/state conflict' },
      429: { description: 'Rate limit' },
      503: { description: 'Readiness/integration unavailable' },
    },
  };
  if (body)
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: ref(body) } },
    };
  (paths[path] ||= {})[method] = operation;
}
for (const name of [
  'register',
  'login',
  'verify-email',
  'forgot-password',
  'reset-password',
  'refresh',
  'logout',
])
  add('post', '/auth/' + name, name, {
    publicRoute: true,
    body: {
      register: 'Register',
      login: 'Login',
      'verify-email': 'Token',
      'forgot-password': 'Forgot',
      'reset-password': 'Reset',
      refresh: 'Empty',
      logout: 'Empty',
    }[name],
    created: name === 'register',
    description: ['refresh', 'logout'].includes(name)
      ? 'Uses host-only auth-path refresh cookie. Refresh rotates it; replay revokes the family. Exact allowed Origin required.'
      : '',
  });
add('get', '/auth/me', 'Current user');
add('delete', '/auth/me', 'Erase own account', {
  body: 'DeleteAccount',
  description:
    'Correct password and confirmation DELETE; active handovers409, admin transfer required403.',
});
add('post', '/organizations', 'Create organization', {
  body: 'Organization',
  created: true,
});
add('get', '/organizations', 'Admin organization list', { query: pagination });
add('get', '/organizations/mine', 'Own organization');
add('get', '/organizations/{id}', 'Owner/admin detail');
add(
  'patch',
  '/organizations/{id}',
  'Update own organization, returns to pending review',
  { body: 'OrganizationPatch' },
);
add('post', '/organizations/{id}/verify', 'Admin approve/reject organization', {
  body: 'Verify',
});
for (const path of ['/listings', '/listings/nearby'])
  add('get', path, 'Public filtered available listings', {
    query: searchSchema,
    publicRoute: true,
    description:
      'lat/lng must be supplied together. radius in km. Dates ISO8601 with offset. Search excludes elapsed pickup/deadline.',
  });
add('get', '/listings/mine', 'Own listings', { query: pagination });
add('get', '/listings/{id}', 'Public listing detail', { publicRoute: true });
add('post', '/listings', 'Approved restaurant creates listing', {
  body: 'Listing',
  created: true,
  description:
    'preparedAt cannot be future; bestBefore future and after preparation; pickup end after start and no later than bestBefore. Human safety review required.',
});
add('patch', '/listings/{id}', 'Owner replaces available listing fields', {
  body: 'Listing',
});
add('delete', '/listings/{id}', 'Owner cancels available listing', {
  body: 'Empty',
});
add('get', '/claims/mine', 'Own claims; NGO sees pickup code', {
  query: pagination,
});
add(
  'post',
  '/claims',
  'Approved NGO reserves one available listing atomically',
  { body: 'Claim', created: true },
);
for (const action of [
  'approve',
  'reject',
  'confirm-pickup',
  'cancel',
  'no-show',
])
  add('post', '/claims/{id}/' + action, 'Guarded claim action: ' + action, {
    body: action === 'confirm-pickup' ? 'Pickup' : 'Empty',
    description:
      'Role/ownership and transition enforced. Restaurant confirms NGO six-digit code; success only after commit.',
  });
add('post', '/claims/{id}/feedback', 'Completed-claim participant feedback', {
  body: 'Feedback',
  created: true,
});
add('post', '/ai/parse-listing', 'Restaurant reviewed listing draft', {
  body: 'ParseInput',
  description:
    'Note or image required;5MB sniffed JPEG/PNG/WebP. Missing/failed Claude returns manual mode and disclaimer, never a food safety guarantee.',
});
add('get', '/ai/forecast', 'Restaurant category forecast and area demand', {
  query: z.object({ category: z.enum(categories).default('bakery') }).strict(),
});
add(
  'get',
  '/ai/recommendations/{listingId}',
  'Owner/admin ranked nearby NGO score breakdown',
);
add('get', '/ai/recommended-listings', 'NGO personalized nearby food ranking', {
  query: pagination,
  description:
    '10km/200candidate bound; scores pickup hours, category/diet, distance and daily allocated capacity. Works without Claude.',
});
for (const role of ['public', 'restaurant', 'ngo', 'admin'])
  add('get', '/analytics/' + role, role + ' measured impact/analytics', {
    publicRoute: role === 'public',
  });
add('get', '/notifications', 'Own durable notifications', {
  query: pagination,
});
add('patch', '/notifications/{id}/read', 'Mark own notification read', {
  body: 'Empty',
});
for (const name of ['audit', 'users'])
  add('get', '/admin/' + name, 'Admin ' + name, { query: pagination });
add('patch', '/admin/users/{id}', 'Admin enable/disable non-admin user', {
  body: 'UserState',
});
add(
  'post',
  '/admin/listings/{id}/moderate',
  'Admin cancels available listing with audit',
  { body: 'Moderation' },
);
for (const name of ['health', 'ready'])
  add(
    'get',
    '/' + name,
    name === 'health' ? 'Process availability' : 'Database readiness',
    { publicRoute: true },
  );
add('post', '/uploads', 'Restaurant/NGO image upload', {
  created: true,
  description:
    'Multipart file field; one sniffed JPEG/PNG/WebP, maximum5MB; reencoded by Cloudinary. Missing credentials503.',
});
paths['/uploads'].post.requestBody = {
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['file'],
        properties: { file: { type: 'string', format: 'binary' } },
      },
    },
  },
};
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'ReplateAI API',
    version: '0.1.0',
    description:
      'Synthetic free demo. Strict validation, role/ownership and approval checks apply. Same-origin /api proxy is required for first-party refresh cookies. No real food pickup offered.',
  },
  servers: [{ url: '/api/v1' }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ...Object.fromEntries(
        Object.entries(schemas).map(([name, schema]) => [name, json(schema)]),
      ),
      Success: {
        type: 'object',
        required: ['success', 'data'],
        properties: { success: { const: true }, data: {} },
      },
      Error: {
        type: 'object',
        required: ['success', 'message'],
        properties: {
          success: { const: false },
          message: { type: 'string' },
          errors: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
};
