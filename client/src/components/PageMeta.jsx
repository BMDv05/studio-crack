import { useEffect } from 'react';

/* Per-page title + meta description (+ optional noindex). */
export default function PageMeta({ title, description, noindex = false }) {
  useEffect(() => {
    document.title = title;
    let md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', description);
    let robots = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.setAttribute('name', 'robots');
        document.head.appendChild(robots);
      }
      robots.setAttribute('content', 'noindex, nofollow');
    } else if (robots) {
      robots.remove();
    }
  }, [title, description, noindex]);
  return null;
}
