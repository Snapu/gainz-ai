declare module "npm:jose@5.10.0" {
  export type JWTVerifyGetKey = unknown;
  export function createRemoteJWKSet(url: URL): JWTVerifyGetKey;
  export function jwtVerify(
    jwt: string,
    jwks: JWTVerifyGetKey,
    options: { algorithms?: string[]; issuer: string | string[]; audience: string | string[] },
  ): Promise<{ payload: Record<string, unknown> }>;
}
