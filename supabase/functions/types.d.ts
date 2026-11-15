declare module "npm:jose@5" {
  export function createRemoteJWKSet(url: URL): unknown;
  export function jwtVerify(
    jwt: string,
    jwks: unknown,
    options: { issuer: string | string[]; audience: string | string[] },
  ): Promise<{ payload: Record<string, unknown> }>;
}
