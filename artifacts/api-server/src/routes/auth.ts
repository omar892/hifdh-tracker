import { Router, type IRouter } from "express";
import { LoginBody, LoginResponse, LogoutResponse, GetSessionResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const TEACHER_PASSWORD = process.env["TEACHER_PASSWORD"] ?? "hifdh2024";

router.post("/auth/login", (req, res) => {
  const body = LoginBody.parse(req.body);
  if (body.password === TEACHER_PASSWORD) {
    req.session.authenticated = true;
    const data = LoginResponse.parse({ authenticated: true });
    res.json(data);
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    res.clearCookie("connect.sid");
    const data = LogoutResponse.parse({ message: "Logged out successfully" });
    res.json(data);
  });
});

router.get("/auth/session", (req, res) => {
  if (req.session?.authenticated) {
    const data = GetSessionResponse.parse({ authenticated: true });
    res.json(data);
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

export default router;
