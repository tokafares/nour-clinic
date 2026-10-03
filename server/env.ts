export function requireEnv(name: 'DATABASE_URL' | 'JWT_SECRET'): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  if (name === 'JWT_SECRET' && value.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return value;
}
