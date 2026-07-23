// Inline line-icon set, replacing the @tabler/icons-webfont CDN dependency.
// Registry is keyed by the exact strings used as data (e.g. MILESTONE_TYPES icon
// fields in constants.js), so those data definitions didn't need to change.
const S = 2.1;

const ICONS = {
  'ti-x': <path d="M4 4l16 16M20 4L4 20" />,
  'ti-arrow-left': <path d="M20 12H4M10 5l-7 7 7 7" />,
  'ti-arrow-right': <path d="M4 12h16M14 5l7 7-7 7" />,
  'ti-arrow-back-up': <><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 015 5v1" /></>,
  'ti-search': <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8" /></>,
  'ti-player-play': <path d="M7 5.3v13.4c0 .8.9 1.3 1.6.9l10.6-6.7c.6-.4.6-1.3 0-1.7L8.6 4.4c-.7-.4-1.6.1-1.6.9z" />,
  'ti-player-play-filled': <path d="M7 5.3v13.4c0 .8.9 1.3 1.6.9l10.6-6.7c.6-.4.6-1.3 0-1.7L8.6 4.4c-.7-.4-1.6.1-1.6.9z" fill="currentColor" stroke="none" />,
  'ti-player-pause': <path d="M7 4v16M17 4v16" />,
  'ti-loader-2': <path d="M12 3a9 9 0 016.36 15.36" />,
  'ti-trash': <><path d="M4.5 7h15" /><path d="M9 7V4.8c0-.4.4-.8.9-.8h4.2c.5 0 .9.4.9.8V7" /><path d="M6.5 7l.9 12.3c.1.9.8 1.6 1.7 1.6h6.2c.9 0 1.6-.7 1.7-1.6L18 7" /><path d="M10 11v6M14 11v6" /></>,
  'ti-heart': <path d="M12 20.5s-7-4.4-9.5-8.8C.7 8.3 1.7 4.9 4.9 4.1c2-.5 4 .4 5 2 .1.2.3.2.4 0 1-1.6 3-2.5 5-2 3.2.8 4.2 4.2 2.4 7.6-2.5 4.4-9.5 8.8-9.5 8.8z" />,
  'ti-heart-filled': <path d="M12 20.5s-7-4.4-9.5-8.8C.7 8.3 1.7 4.9 4.9 4.1c2-.5 4 .4 5 2 .1.2.3.2.4 0 1-1.6 3-2.5 5-2 3.2.8 4.2 4.2 2.4 7.6-2.5 4.4-9.5 8.8-9.5 8.8z" fill="currentColor" stroke="none" />,
  'ti-users': <><circle cx="9" cy="9.5" r="3" /><circle cx="16" cy="10.5" r="2.4" /><path d="M4 19c.3-3 2.3-5 5-5s4.7 2 5 5" /><path d="M13.8 15.3c2.1.2 3.6 1.7 3.9 3.7" /></>,
  'ti-star': <path d="M12 3.5l2.5 5.3 5.8.6-4.3 4 1.1 5.8L12 16.6 6.9 19.2l1.1-5.8-4.3-4 5.8-.6z" />,
  'ti-star-filled': <path d="M12 3.5l2.5 5.3 5.8.6-4.3 4 1.1 5.8L12 16.6 6.9 19.2l1.1-5.8-4.3-4 5.8-.6z" fill="currentColor" stroke="none" />,
  'ti-lock': <><rect x="5.5" y="10.5" width="13" height="9" rx="2.2" /><path d="M8 10.5V7.7a4 4 0 018 0v2.8" /></>,
  'ti-camera': <><path d="M4 8.5c0-.8.7-1.5 1.5-1.5h1.3l1-1.6h8.4l1 1.6h1.3c.8 0 1.5.7 1.5 1.5V17c0 .8-.7 1.5-1.5 1.5h-13A1.5 1.5 0 014 17z" /><circle cx="12" cy="12.3" r="3.2" /></>,
  'ti-camera-off': <><path d="M4 8.5c0-.8.7-1.5 1.5-1.5h1.3l1-1.6h8.4l1 1.6h1.3c.8 0 1.5.7 1.5 1.5V17c0 .5-.3 1-.7 1.3" /><path d="M17.3 18.3c-.2 0-.5.2-.8.2h-9A1.5 1.5 0 016 17v-6.3" /><line x1="3" y1="3" x2="21" y2="21" /></>,
  'ti-arrows-diff': <><path d="M4 8h11M11 4l4 4-4 4" /><path d="M20 16H9M13 12l-4 4 4 4" /></>,
  'ti-pencil': <><path d="M4 20l1-4.2L15.8 5 19 8.2 8.2 19z" /><path d="M13 7l4 4" /></>,
  'ti-check': <path d="M4 12.5l5.5 5.5L20 6" />,
  'ti-bulb': <><path d="M9.5 18h5M10.3 21h3.4" /><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0012 3z" /></>,
  'ti-sparkles': <><path d="M11.5 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" /><path d="M17.5 13l.6 1.8 1.9.7-1.9.7-.6 1.8-.6-1.8-1.9-.7 1.9-.7z" /></>,
  'ti-map-pin': <><path d="M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 1118.5 10c0 4.9-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  'ti-chevron-right': <path d="M8 4l9 8-9 8" />,
  'ti-chevron-left': <path d="M16 4l-9 8 9 8" />,
  'ti-chevron-down': <path d="M4 8l8 9 8-9" />,
  'ti-microphone': <><rect x="9.3" y="3.5" width="5.4" height="9.5" rx="2.7" /><path d="M6 11c0 3.3 2.7 5.5 6 5.5s6-2.2 6-5.5" /><path d="M12 16.5V20" /></>,
  'ti-plus': <path d="M12 5v14M5 12h14" />,
  'ti-notebook': <><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 3.5v17M5.5 8h3.5M5.5 12.5h3.5" /></>,
  'ti-music': <><path d="M9 18V5.5l10-2v12.5" /><circle cx="7" cy="18" r="2.3" /><circle cx="17" cy="16" r="2.3" /></>,
  'ti-mail': <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  'ti-mail-check': <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /><path d="M9.5 15.5l2 2 3.5-4" /></>,
  'ti-cake': <><path d="M4.5 20v-6.3a2 2 0 012-2h11a2 2 0 012 2V20" /><path d="M4.5 20h15" /><path d="M4.5 16.3c1 .9 2 .9 3 0s2-.9 3 0 2 .9 3 0 2-.9 3 0 2 .9 3 0" /><path d="M8.5 11.7V8.4M12 11.7V8.4M15.5 11.7V8.4" /><path d="M8.5 8.4c0-.8.5-1-.1-1.9M12 8.4c0-.8.5-1-.1-1.9M15.5 8.4c0-.8.5-1-.1-1.9" /></>,
  'ti-calendar': <><rect x="4.5" y="5.5" width="15" height="14.5" rx="2" /><path d="M4.5 10h15M8.5 3.5v3.6M15.5 3.5v3.6" /></>,
  'ti-calendar-event': <><rect x="4.5" y="5.5" width="15" height="14.5" rx="2" /><path d="M4.5 10h15M8.5 3.5v3.6M15.5 3.5v3.6" /><circle cx="12" cy="15" r="1.6" /></>,
  'ti-calendar-exclamation': <><rect x="4.5" y="5.5" width="15" height="14.5" rx="2" /><path d="M4.5 10h15M8.5 3.5v3.6M15.5 3.5v3.6" /><path d="M12 13v2.6" /><circle cx="12" cy="17.6" r=".15" /></>,
  'ti-keepsakes': <><path d="M5 10.5c0-1 .8-1.8 1.8-1.8h10.4c1 0 1.8.8 1.8 1.8V18a1.8 1.8 0 01-1.8 1.8H6.8A1.8 1.8 0 015 18z" /><path d="M9 8.7V7.3A1.8 1.8 0 0110.8 5.5h2.4A1.8 1.8 0 0115 7.3v1.4" /><path d="M5 13.2h14" /></>,
  'ti-profile-quill': null,
  'ti-user': <><circle cx="12" cy="8.3" r="3.3" /><path d="M5.5 20c.6-4 3-6.3 6.5-6.3s5.9 2.3 6.5 6.3" /></>,
  'ti-user-plus': <><circle cx="10" cy="8.3" r="3.3" /><path d="M4 20c.6-3.7 2.8-5.9 6-6.3" /><path d="M17 8.5v6M20 11.5h-6" /></>,
  'ti-copy': <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6.5A1.5 1.5 0 0013.5 5H5.5A1.5 1.5 0 004 6.5v8A1.5 1.5 0 005.5 16H9" /></>,
  'ti-send': <path d="M20 4L3 10.8l6.3 2.6M20 4l-6 16-4.7-6.6M20 4L9.3 13.4" />,
  'ti-refresh': <><path d="M4 12a8 8 0 0113.7-5.7L20 8.5" /><path d="M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 01-13.7 5.7L4 15.5" /><path d="M4 20v-4.5h4.5" /></>,
  'ti-link': <><path d="M9.5 14.5l5-5" /><path d="M11 6.8l1-1a3.7 3.7 0 015.3 5.3l-1.4 1.4" /><path d="M13 17.2l-1 1a3.7 3.7 0 01-5.3-5.3l1.4-1.4" /></>,
  'ti-link-off': <><path d="M11 6.8l1-1a3.7 3.7 0 015.3 5.3l-1.4 1.4" /><path d="M13 17.2l-1 1a3.7 3.7 0 01-5.3-5.3l1.4-1.4" /><line x1="3" y1="3" x2="21" y2="21" /></>,
  'ti-photo': <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M20 15.5l-4.8-4.6a1.5 1.5 0 00-2 0L5 18.5" /></>,
  'ti-photos': <><rect x="6.5" y="6.5" width="14" height="12" rx="2" /><path d="M3.5 4v12.5a1.5 1.5 0 001.5 1.5" /><circle cx="11" cy="10.5" r="1.3" /><path d="M20.5 15l-3.8-3.6a1.4 1.4 0 00-1.9 0L10 16" /></>,
  'ti-share-2': <><circle cx="18" cy="5.5" r="2.3" /><circle cx="18" cy="18.5" r="2.3" /><circle cx="6" cy="12" r="2.3" /><path d="M8.1 10.8l7.8-4.4M8.1 13.2l7.8 4.4" /></>,
  'ti-message-circle': <path d="M4 12a8 8 0 1112.2 6.8L20 20l-2-3.7A8 8 0 014 12z" />,
  'ti-leaf': <><path d="M6 19c-1.5-5.5.5-11 8-13.5 4.5-1.5 7 1 6 5-2 8-8 10-14 8.5z" /><path d="M6.5 18.5c3-4 6-7 11-11" /></>,
  'ti-layout-list': <><rect x="4" y="5" width="6" height="6" rx="1.2" /><rect x="4" y="13" width="6" height="6" rx="1.2" /><path d="M13 7h7M13 10h7M13 15h7M13 18h7" /></>,
  'ti-eye': <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></>,
  'ti-eye-off': <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /><line x1="3" y1="3" x2="21" y2="21" /></>,
  'ti-dots': <><circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none" /></>,
  'ti-activity': <path d="M3 12h4l2-7 4 14 2-7h6" />,
  'ti-ruler': <><path d="M4 15.5L15.5 4l4.5 4.5L8.5 20z" /><path d="M7 12.5l1.8 1.8M9.5 10l1.8 1.8M12 7.5l1.8 1.8" /></>,
  'ti-circle-check': <><circle cx="12" cy="12" r="8.5" /><path d="M8.3 12.3l2.6 2.6 5-5.2" /></>,
  'ti-book': <><path d="M5 4.8c2.4-.8 5-.6 7 1v13c-2-1.6-4.6-1.8-7-1z" /><path d="M19 4.8c-2.4-.8-5-.6-7 1v13c2-1.6 4.6-1.8 7-1z" /></>,
  'ti-book-2': <><rect x="4.5" y="4" width="15" height="16" rx="1.6" /><path d="M8 4v16" /></>,
  'ti-bell': <><path d="M6 16V11a6 6 0 0112 0v5l1.6 2.5H4.4z" /><path d="M9.7 20a2.3 2.3 0 004.6 0" /></>,
  'ti-bell-off': <><path d="M6 16V11c0-1 .2-1.9.6-2.7M8.7 6.3A6 6 0 0118 11v5l1.6 2.5H7" /><path d="M9.7 20a2.3 2.3 0 004.6 0" /><line x1="3" y1="3" x2="21" y2="21" /></>,
  'ti-writing': <><path d="M4 20l.7-3.2L14 7.5l2.5 2.5-9.3 9.3z" /><path d="M15 5.5l3.5 3.5" /><path d="M4 20h5" /></>,
  'ti-world': <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5a13 13 0 010 17M12 3.5a13 13 0 000 17" /></>,
  'ti-video': <><rect x="3.5" y="6.5" width="12" height="11" rx="2" /><path d="M15.5 10.3l5-2.8v9l-5-2.8z" /></>,
  'ti-shield-lock': <><path d="M12 3.5l7 2.6V11c0 4.8-3 8.2-7 9.5-4-1.3-7-4.7-7-9.5V6.1z" /><rect x="9.3" y="11.3" width="5.4" height="4.2" rx="1" /><path d="M10.5 11.3V9.8a1.5 1.5 0 013 0v1.5" /></>,
  'ti-select': <><rect x="4.5" y="4.5" width="15" height="15" rx="2.5" /><path d="M8.3 12.3l2.4 2.4 5-5.2" /></>,
  'ti-piece': <path d="M6 6h4.2a1.6 1.6 0 013 0H17a1 1 0 011 1v3.8a1.6 1.6 0 010 3.2V18a1 1 0 01-1 1h-3.8a1.6 1.6 0 00-3.2 0H6a1 1 0 01-1-1v-3.8a1.6 1.6 0 000-3.2V7a1 1 0 011-1z" />,
  'ti-letter': <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /><path d="M9.5 12.3l-4.7 5" /></>,
  'ti-kid': <><circle cx="12" cy="7" r="3.4" /><path d="M6 19.5c.5-3.6 2.6-5.5 6-5.5s5.5 1.9 6 5.5" /></>,
  'ti-home': <><path d="M4.5 11.2L12 4.8l7.5 6.4" /><path d="M6 9.8V19a1 1 0 001 1h3.2v-5.4h3.6V20H17a1 1 0 001-1V9.8" /></>,
  'ti-folder': <path d="M4 7.5c0-1 .8-1.8 1.8-1.8h3.9l1.7 2h6.8c1 0 1.8.8 1.8 1.8v8.7a1.8 1.8 0 01-1.8 1.8H5.8A1.8 1.8 0 014 18.4z" />,
  'ti-feather': <><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /><line x1="17.5" y1="15" x2="9" y2="15" /></>,
  'ti-edit': <><path d="M4 20l1-4.2L15.8 5 19 8.2 8.2 19z" /><path d="M13 7l4 4" /></>,
  'ti-crop': <><path d="M6 2v14a2 2 0 002 2h14" /><path d="M18 22V8a2 2 0 00-2-2H2" /></>,
  'ti-alert-circle': <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5" /><circle cx="12" cy="16.3" r=".15" /></>,
  'ti-trip': <><rect x="4" y="8.5" width="16" height="10.5" rx="2" /><path d="M8.5 8.5V6.3A1.8 1.8 0 0110.3 4.5h3.4a1.8 1.8 0 011.8 1.8v2.2" /><path d="M4 13.5h16" /></>,
  'ti-plane': <path d="M12 2.5l1.8 1.8-1 5.4 6.9 4v2l-6.9-2.1-1 5 2.4 1.8v1.7L12 21l-2.2 1.1v-1.7l2.4-1.8-1-5-6.9 2.1v-2l6.9-4-1-5.4z" />,
  'ti-movie': <><rect x="3.5" y="6.5" width="17" height="12" rx="2" /><path d="M3.5 10.5h17" /><path d="M7.5 6.5l2 4M12.5 6.5l2 4M17.2 6.5l2 4" /></>,
  'ti-bookmark': <path d="M6.5 4.5h11a1 1 0 011 1V20l-6.5-3.8L5.5 20V5.5a1 1 0 011-1z" />,
  'ti-bookmark-filled': <path d="M6.5 4.5h11a1 1 0 011 1V20l-6.5-3.8L5.5 20V5.5a1 1 0 011-1z" fill="currentColor" stroke="none" />,
  'ti-arrows-up-down': <><path d="M8 5v14M8 5L5 8M8 5l3 3" /><path d="M16 19V5M16 19l3-3M16 19l-3-3" /></>,
  'ti-walk': <><circle cx="13.5" cy="4.2" r="1.8" /><path d="M13 7.7l-2.5 3 3 2.2-1.2 6.3" /><path d="M12 9.2l-4 1.5" /><path d="M13.8 12.9l3.2 1.6-.6 4.5" /></>,
  'ti-school': <><path d="M12 4L2.5 8.5 12 13l9.5-4.5z" /><path d="M6.5 10.7v4c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8v-4" /><path d="M21.5 8.5v6" /></>,
  'ti-piano': <><rect x="4" y="6" width="16" height="12" rx="1.5" /><path d="M8 6v7.5M12 6v7.5M16 6v7.5" /><path d="M4 13.5h16" /></>,
};

// The Profile nav tab uses the actual quill+inkwell silhouette lifted from
// public/icon-512.png (background chroma-keyed out) rather than a redrawn
// glyph — a hand-drawn stand-in didn't read clearly, the real mark does.
function QuillMark({ style, className, ...rest }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width: '1em',
        height: '1em',
        flexShrink: 0,
        verticalAlign: 'middle',
        backgroundColor: 'currentColor',
        WebkitMaskImage: 'url(/quill-mask.png)',
        maskImage: 'url(/quill-mask.png)',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        ...style,
      }}
      {...rest}
    />
  );
}

export function Icon({ name, style, className, ...rest }) {
  if (name === 'ti-profile-quill') return <QuillMark style={style} className={className} {...rest} />;
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={S}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ width: '1em', height: '1em', display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
      {...rest}
    >
      {glyph}
    </svg>
  );
}
