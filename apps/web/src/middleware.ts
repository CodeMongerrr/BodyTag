import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const match = url.pathname.match(/^\/@([^/]+)\/([^/]+)\/?$/);
  if (match) {
    url.pathname = `/c/${match[1]}/${match[2]}`;
    return NextResponse.rewrite(url);
  }
  const preview = url.pathname.match(/^\/@([^/]+)\/?$/);
  if (preview) {
    url.pathname = `/c/${preview[1]}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|css|js|glb|mp3)).*)"],
};
