export type Identity = {
  webId: string;
  displayName?: string;
  avatarUrl?: string;
  issuer?: string;
};

export type LoginArgs = {
  issuer: string;
};

export type LoginHandler = (args: LoginArgs) => void | Promise<void>;
