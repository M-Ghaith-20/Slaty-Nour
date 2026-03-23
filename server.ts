import express from "express";
import { createServer as createViteServer } from "vite";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  const getRedirectUri = (req: express.Request) => {
    // Use the APP_URL if provided, or fall back to the request origin
    const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    return `${origin}/api/auth/google/callback`;
  };

  // Google Auth URL
  app.get("/api/auth/google/url", (req, res) => {
    const redirectUri = getRedirectUri(req);
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      redirect_uri: redirectUri,
    });
    res.json({ url });
  });

  // Google Callback
  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    const redirectUri = getRedirectUri(req);

    try {
      const { tokens } = await client.getToken({
        code: code as string,
        redirect_uri: redirectUri,
      });
      client.setCredentials(tokens);

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (payload) {
        const user = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
        };

        // Set cookie with user data
        res.cookie("user", JSON.stringify(user), {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>تم تسجيل الدخول بنجاح. سيتم إغلاق هذه النافذة تلقائياً.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google OAuth Error:", error);
      res.status(500).send("فشل تسجيل الدخول بواسطة Google.");
    }
  });

  // Get current user
  app.get("/api/auth/me", (req, res) => {
    const userCookie = req.cookies.user;
    if (userCookie) {
      try {
        res.json(JSON.parse(userCookie));
      } catch (e) {
        res.status(401).json({ error: "Unauthorized" });
      }
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("user", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
