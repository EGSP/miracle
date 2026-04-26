export interface JwtPayload {

    /**
     * User ID
     */
    sub: string;

    /**
     * Issued at
     */
    iat?: number;

    /**
     * Expiration time
     */
    exp?: number;
}

export interface AuthTokens {
    accessToken?: string;
    refreshToken?: string;
}

export interface NewAuthTokens extends AuthTokens {
    accessToken: string;
    refreshToken: string;
}