export interface JwtPayload {

    /**
     * Идентификатор пользователя
     */
    sub: string;

    /**
     * Время выпуска токена
     */
    iat?: number;

    /**
     * Время истечения токена
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