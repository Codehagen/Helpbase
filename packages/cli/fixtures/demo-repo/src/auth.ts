// Pretend production auth handler. The demo fixture references lines 12-18
// as the citation for the proposed doc update.

import type { Request, Response } from "express"

interface Session {
  userId: string
  scopes: string[]
}

export function authenticate(req: Request, res: Response): Session | null {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" })
    return null
  }
  const token = header.slice("Bearer ".length)
  return verifyToken(token)
}

function verifyToken(_token: string): Session | null {
  // ...
  return null
}
