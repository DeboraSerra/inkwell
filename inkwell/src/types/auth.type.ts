export type UserProfile = {
  id: string;
  email: string;
  name?: string | null;
  photoUrl?: string | null;
};

export type CreateTokenState = { token?: string; error?: string };
