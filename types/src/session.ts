export type Session = {
  id?: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
};

/** Сессия без токенов — для админского просмотра */
export type PublicSession = {
  id: string;
  userId: string;
};
