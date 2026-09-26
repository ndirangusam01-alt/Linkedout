import "./globals.css";
import { PostsProvider } from "./providers";
import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";
import { NotificationsProvider } from "./notifications-provider";
import { ComposerProvider } from "./composer-provider";
import Shell from "@/components/Shell";

export const metadata = {
  title: "LinkedOut — the blooper reel to LinkedIn's highlight reel",
  description: "Honest career reality: layoffs, burnout, bad bosses, and the truth LinkedIn won't let you post.",
};

// Runs before React hydrates, synchronously, so there's never a flash of
// the wrong theme. Reads the same localStorage key ThemeProvider reads
// (app/theme-provider.js) and sets data-theme immediately; ThemeProvider
// reconciles its own state with this on mount rather than fighting it.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("lo-theme-mode");
    var mode = stored === "light" || stored === "dark" ? stored : "system";
    var resolved = mode === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : mode;
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <AuthProvider>
            <NotificationsProvider>
              <PostsProvider>
                <ComposerProvider>
                  <Shell>{children}</Shell>
                </ComposerProvider>
              </PostsProvider>
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
