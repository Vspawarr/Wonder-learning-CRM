// Sends signed-out visitors to /login (see `authorized` in src/auth.ts).
// Pages and server actions still check the session themselves via requireUser().
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
