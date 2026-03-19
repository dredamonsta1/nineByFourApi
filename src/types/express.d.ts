declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: 'user' | 'admin' | 'agent';
        iat: number;
        exp: number;
      };
      agent?: import('./api.js').Agent;
    }
  }
}
export {};
