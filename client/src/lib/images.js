// Transform only known Cloudinary upload paths; leave third-party URLs unchanged.
export function imageUrl(url, width = 640) {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== 'res.cloudinary.com' ||
      !parsed.pathname.includes('/image/upload/')
    )
      return url;
    return url.replace(
      '/image/upload/',
      `/image/upload/f_auto,q_auto,w_${width},c_limit/`,
    );
  } catch {
    return url;
  }
}
