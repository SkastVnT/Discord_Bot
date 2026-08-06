import { NextResponse, type NextRequest } from "next/server";

/**
 * Chặn truy cập cho công cụ dev.
 *
 * Công cụ này nối thẳng vào Atlas production và bucket R2 thật, xóa ở đây là xóa
 * thật — nên dù chỉ chạy localhost vẫn không để trần. Hai lớp:
 *
 *  1. Chỉ nghe 127.0.0.1 (đặt trong script `next dev -H 127.0.0.1`).
 *  2. Token trong cookie. Mở `http://127.0.0.1:3100/?key=<DEV_UI_TOKEN>` một lần
 *     để đặt cookie, sau đó điều hướng bình thường.
 *
 * Đây KHÔNG phải lớp bảo vệ cho môi trường công khai. Đừng deploy app này.
 */

const COOKIE = "dev_ui_token";

export function middleware(request: NextRequest): NextResponse {
  const expected = process.env.DEV_UI_TOKEN;

  // Không đặt token thì khoá hẳn, thay vì mở toang. Cấu hình thiếu phải fail-closed.
  if (!expected) {
    return new NextResponse(
      "DEV_UI_TOKEN chưa được đặt trong web/.env.local — công cụ đang bị khoá.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const fromQuery = request.nextUrl.searchParams.get("key");
  if (fromQuery) {
    if (fromQuery !== expected) {
      return new NextResponse("Token sai.", { status: 401 });
    }
    // Bỏ token khỏi URL sau khi đổi thành cookie, để nó không nằm lại trong
    // lịch sử trình duyệt và header Referer.
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("key");
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, expected, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  }

  if (request.cookies.get(COOKIE)?.value === expected) return NextResponse.next();

  return new NextResponse(
    "Chưa xác thực.\n\nMở: http://127.0.0.1:3100/?key=<DEV_UI_TOKEN trong web/.env.local>",
    { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
