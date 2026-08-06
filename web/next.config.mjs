/** @type {import('next').NextConfig} */
const nextConfig = {
  // mongodb và aws-sdk có native binding + require động; để webpack bundle chúng
  // sẽ hỏng lúc chạy. Giữ ở ngoài để Node require thẳng từ node_modules.
  serverExternalPackages: ["mongodb", "@aws-sdk/client-s3"],

  experimental: {
    // File nhạc đi qua server action lên R2. Mặc định 1MB thì không upload nổi
    // bài nào; nới lên trên trần R2_MAX_UPLOAD_MB một chút cho phần overhead.
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;
