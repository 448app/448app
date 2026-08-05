/* icons.js
   Shared SVG icon library — สไตล์ Planista flat icons (red/white theme)
   ใช้: getIcon('home')  → '<svg ...>...</svg>'  (replace emoji)
        getIcon('home', { circle:true }) → '<span class="svg-icon-circle">SVG</span>'

   SVG ทั้งหมดใช้ viewBox 24×24, fill=currentColor — CSS theming ผ่าน color
   เพิ่ม icon ใหม่ได้โดยเพิ่ม path ใน ICON_LIB */

(function () {
  /* Each entry = SVG inner content (paths/shapes), viewBox 24×24 */
  const ICON_LIB = {
    /* ── Sidebar / Navigation ── */
    home:        '<path d="M12 3L2 12h3v8h5v-6h4v6h5v-8h3L12 3z"/>',
    users:       '<path d="M9 11a4 4 0 100-8 4 4 0 000 8zm6-2a3 3 0 100-6 3 3 0 000 6zm-6 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm6 0c-.29 0-.62.02-.97.05A5.78 5.78 0 0117 15v3h6v-3c0-2.66-5.33-4-8-4z"/>',
    cashflow:    '<path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm.95 16.1V19h-1.9v-1.4c-1.7-.36-3.05-1.42-3.1-3.1h1.8c.09.95.74 1.7 2.1 1.7 1.45 0 1.8-.73 1.8-1.2 0-.62-.33-1.2-1.97-1.6-1.84-.43-3.1-1.18-3.1-2.71 0-1.27 1.04-2.1 2.47-2.4V7h1.9v1.3c1.55.37 2.33 1.55 2.4 2.85h-1.83c-.04-.99-.55-1.55-1.62-1.55-1.03 0-1.65.48-1.65 1.15 0 .58.45 1 1.97 1.4 1.5.39 3.1 1.04 3.1 2.93 0 1.36-1.02 2.1-2.37 2.42z"/>',
    wallet:      '<path d="M21 7H3a1 1 0 010-2h15a1 1 0 100-2H3a3 3 0 00-3 3v12a3 3 0 003 3h18a2 2 0 002-2V9a2 2 0 00-2-2zm-3 9a2 2 0 110-4 2 2 0 010 4z"/>',
    balance:     '<path d="M12 2L2 7v3l10-5 10 5V7L12 2zm-7 9v6h2v-6H5zm5 0v6h2v-6h-2zm5 0v6h2v-6h-2zm5 0v6h2v-6h-2zM2 19v3h20v-3H2z"/>',
    ratios:      '<path d="M3 21V3h2v16h16v2H3zm4-4l4-4 4 4 6-7-1.4-1.4L15 14l-4-4-6 6 2 1z"/>',
    education:   '<path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm-7 9.18v4L12 20l7-3.82v-4L12 16l-7-3.82z"/>',
    retirement:  '<path d="M21 10c0-1.66-1.34-3-3-3h-3V5c0-1.66-1.34-3-3-3H9C7.34 2 6 3.34 6 5v2H3c-1.66 0-3 1.34-3 3v8h2v-3h20v3h2v-8zM8 5c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2H8V5zm12 8H2v-3c0-.55.45-1 1-1h18c.55 0 1 .45 1 1v3z"/>',
    goals:       '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>',
    umbrella:    '<path d="M12 2v.5M2 12Q4.5 13.5 7 12Q9.5 13.5 12 12Q14.5 13.5 17 12Q19.5 13.5 22 12A10 10 0 0 0 2 12zM11 12v7.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5h-2c0 1.66 1.34 3 3 3s3-1.34 3-3V12h-2z"/>',
    medical:     '<path d="M19 8h-2V4H7v4H5c-1.1 0-2 .9-2 2v10h18V10c0-1.1-.9-2-2-2zM9 6h6v2H9V6zm6 11h-2v2h-2v-2H9v-2h2v-2h2v2h2v2z"/>',
    chart:       '<path d="M3 13h2v8H3v-8zm4-5h2v13H7V8zm4 8h2v5h-2v-5zm4-3h2v8h-2v-8zm4-7h2v15h-2V6z"/>',
    trendingUp:  '<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.29-6.29L22 12V6z"/>',
    clipboard:   '<path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>',
    timeline:    '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>',
    tax:         '<path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 21l4-4h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7 9h2v2H7V9zm0 4h2v2H7v-2zm4-4h2v2h-2V9zm0 4h2v2h-2v-2zm4-4h2v2h-2V9zm0 4h2v2h-2v-2z"/>',
    calendar:    '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z"/>',
    book:        '<path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>',
    priority:    '<path d="M3 4v16h2V4H3zm6 0v4h12V4H9zm0 6v4h8v-4H9zm0 6v4h10v-4H9z"/>',

    /* ── Asset Types ── */
    cash:        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.88 14.76V18h-1.75v-1.29c-1.13-.24-2.13-.96-2.21-2.32h1.28c.07.74.58 1.32 1.85 1.32 1.36 0 1.66-.68 1.66-1.1 0-.58-.31-1.12-1.87-1.49-1.74-.42-2.93-1.13-2.93-2.57 0-1.21.97-2 2.22-2.26V7h1.75v1.31c1.35.32 2.02 1.34 2.07 2.46h-1.28c-.04-.74-.43-1.32-1.61-1.32-1.13 0-1.81.51-1.81 1.23 0 .63.49 1.05 1.83 1.4 1.71.42 2.97 1.07 2.97 2.58 0 1.29-.97 2-2.17 2.1z"/>',
    deposit:     '<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>',
    bond:        '<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-2 16H8v-2h4v2zm4-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
    shield:      '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>',
    building:    '<path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>',
    seedling:    '<path d="M12 22c-4 0-7-3-7-7 0-2 1-4 2-5l1 1c-1 1-1 3-1 4 0 3 2 5 5 5s5-2 5-5c0-2-1-4-3-5 1-1 2-3 2-5 0-2-1-3-3-4l1-1c2 1 4 3 4 5 0 3-2 5-3 6 1 1 2 3 2 5 0 4-3 7-5 7z"/>',
    leaf:        '<path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3c.5.12 1 .2 1.55.2 5.5 0 10-4.5 10-10 0-2.05-.62-3.97-1.68-5.55L17 8zM7.27 19.78c1.91-4.43 3.84-9.07 9.4-11.34-.62 4.41-4.16 8.06-8.91 8.66l-.49 2.68z"/>',
    globe:       '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM18.92 8h-2.95a15.65 15.65 0 00-1.38-3.56A8.03 8.03 0 0118.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 015.08 16zm2.95-8H5.08a7.987 7.987 0 014.33-3.56A15.65 15.65 0 008.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 01-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/>',
    bank:        '<path d="M4 10h3v7H4v-7zm6.5 0h3v7h-3v-7zM2 19h20v3H2v-3zM17 10h3v7h-3v-7zM12 1L2 6v2h20V6L12 1z"/>',
    link:        '<path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>',
    house:       '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
    chartBar:    '<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>',
    box:         '<path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4l16-.02V7z"/>',
    piggy:       '<path d="M14 2a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm.75 4.5H14v.75h-.5V6.5h-.75v-.5h.75v-.75H14v-.75h.5v-.25h.75v.25h.75v.5h-.75v.75h.75v.5h-.75v.25zM10 8c-.65 0-1.28.09-1.87.25L6.5 6.5l-1 1L6.8 9.32C5.04 10.32 3.5 11.95 3 14H1.5L1 15v1l.5 1H2c.3 1.06.86 2.02 1.6 2.78L3 21.5h2.5l.4-.85c.45.22.94.39 1.45.5L7.5 22h2.5l.5-1c.16.01.33.02.5.02s.34-.01.5-.02l.5 1h2.5l.15-.85c.51-.11 1-.28 1.45-.5l.4.85h2.5L17.4 19.78A6.97 6.97 0 0019.5 17h.5l.5-1v-1l-.5-1h-1.5c-.5-2-2-3.6-4-4.4-.07-.04-.13-.07-.2-.1l-.96-2.4c-.97-.7-2.13-1.1-3.34-1.1zM7 14a1 1 0 110-2 1 1 0 010 2z"/>',
    medical2:    '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 11h-3v3h-2v-3H8v-2h3V9h2v3h3v2z"/>',
    summary:     '<path d="M19 5v14H5V5h14m1.1-2H3.9c-.5 0-.9.4-.9.9v16.2c0 .4.4.9.9.9h16.2c.4 0 .9-.5.9-.9V3.9c0-.5-.5-.9-.9-.9zM11 7h6v2h-6V7zm0 4h6v2h-6v-2zm0 4h6v2h-6v-2zM7 7h2v2H7V7zm0 4h2v2H7v-2zm0 4h2v2H7v-2z"/>',
    sofa:        '<path d="M20 10V8a3 3 0 00-3-3H7a3 3 0 00-3 3v2a3 3 0 00-3 3v4a2 2 0 002 2v1a1 1 0 002 0v-1h14v1a1 1 0 002 0v-1a2 2 0 002-2v-4a3 3 0 00-3-3zM6 8a1 1 0 011-1h10a1 1 0 011 1v2.17A3 3 0 0016 13v1H8v-1a3 3 0 00-2-2.83V8zm15 9H3v-4a1 1 0 011-1 1 1 0 011 1v2a1 1 0 001 1h12a1 1 0 001-1v-2a1 1 0 011-1 1 1 0 011 1v4z"/>',
    dollarCircle:'<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.31 15.86V19h-2v-1.13c-1.52-.29-2.72-1.16-2.72-2.77h1.71c.08.92.71 1.64 2.31 1.64 1.71 0 2.1-.86 2.1-1.39 0-.72-.39-1.41-2.34-1.87-2.17-.52-3.66-1.42-3.66-3.21 0-1.51 1.21-2.49 2.72-2.81V6h2.34v1.36c1.62.4 2.44 1.63 2.49 2.97h-1.71c-.04-.98-.56-1.64-1.94-1.64-1.31 0-2.1.59-2.1 1.43 0 .73.57 1.22 2.34 1.67 1.81.46 3.71 1.22 3.7 3.42-.01 1.61-1.2 2.48-2.72 2.77z"/>',
    car:         '<path d="M18.92 5.01C18.72 4.42 18.16 4 17.5 4h-11c-.66 0-1.21.42-1.42 1.01L3 11v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 6h10.29l1.04 3H5.81l1.04-3zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
    airplane:    '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
    shopping:    '<path d="M19 6h-3V5a4 4 0 00-8 0v1H5c-.55 0-1 .45-1 1v13c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7c0-.55-.45-1-1-1zm-9-1c0-1.1.9-2 2-2s2 .9 2 2v1h-4V5zm6 4.5c-.83 0-1.5-.67-1.5-1.5h-1.5c0 1.66 1.34 3 3 3s3-1.34 3-3h-1.5c0 .83-.67 1.5-1.5 1.5zM10 9.5c-.83 0-1.5-.67-1.5-1.5H7c0 1.66 1.34 3 3 3v-1.5z"/>',
    briefcase:   '<path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>',
    creditCard:  '<path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>',
    pin:         '<path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>',

    /* ── Group / Action ── */
    waterDrop:   '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>',
    chartLine:   '<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.29-6.29L22 12V6z"/>',
    settings:    '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>',
    info:        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
    plus:        '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
    minus:       '<path d="M19 13H5v-2h14v2z"/>',
    edit:        '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
    trash:       '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
    arrowLeft:   '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>',
    arrowRight:  '<path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>',
    check:       '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
    close:       '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
    /* Floating menu: Timeline (route/map style), Pyramid (3-tier hierarchy), Exit (logout door) */
    map:         '<path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>',
    pyramid:     '<path d="M12 3L1 22h22L12 3zm0 4.07l2.04 3.51h-4.08L12 7.07zm-3 5.18h6l2.04 3.51H7L9 12.25zM4.48 20l1.78-3.06h11.48L19.52 20H4.48z"/>',
    exit:        '<path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>',
  };

  /* Aliases — emoji → icon name (used by auto-replace) */
  const EMOJI_MAP = {
    '🏠': 'home',
    '👥': 'users',
    '💰': 'cashflow',
    '💎': 'wallet',
    '⚖️': 'balance',
    '⚖':  'balance',
    '📐': 'ratios',
    '🎓': 'education',
    '🛋️': 'retirement',
    '🛋':  'retirement',
    '🎯': 'goals',
    '☂️': 'umbrella',
    '☂':  'umbrella',
    '⚕️': 'medical',
    '⚕':  'medical',
    '📊': 'chart',
    '📈': 'trendingUp',
    '📋': 'clipboard',
    '⏳': 'timeline',
    '🧾': 'tax',
    '📅': 'calendar',
    '📆': 'calendar',
    '📖': 'book',
    '💵': 'cash',
    '🐷': 'deposit',
    '📜': 'bond',
    '🛡️': 'shield',
    '🛡':  'shield',
    '🏢': 'building',
    '🌱': 'seedling',
    '🌿': 'leaf',
    '🌍': 'globe',
    '🏦': 'bank',
    '🔗': 'link',
    '📦': 'box',
    '💧': 'waterDrop',
    '⚙️': 'settings',
    '⚙':  'settings',
    'ℹ️': 'info',
    'ℹ':  'info',
    '➕': 'plus',
    '➖': 'minus',
    '✏️': 'edit',
    '✏':  'edit',
    '🗑️': 'trash',
    '🗑':  'trash',
    '←':  'arrowLeft',
    '→':  'arrowRight',
    '✓':  'check',
    '✔':  'check',
    '✖':  'close',
    '✕':  'close',
  };

  /* PNG mask icons — สำหรับ icons ที่ออกแบบยากใน inline SVG
     ใช้ CSS mask-image → PNG เป็น mask, background-color = currentColor
     → เปลี่ยนสีตาม theme เหมือน SVG (gold/navy/etc.) */
  const ICON_PNG_MASK = {
    piggy: 'icon_piggybank-15.png',
  };

  function getIcon(name, opts) {
    opts = opts || {};
    const size = opts.size || 24;
    const cls = opts.className || 'svg-icon';

    /* PNG mask icon — uses CSS mask so it inherits color from currentColor
       mask-mode:luminance — สำหรับ PNG ที่มี white background (black shape = แสดง, white = โปร่ง) */
    if (ICON_PNG_MASK[name]) {
      const url = ICON_PNG_MASK[name];
      return `<span class="${cls} png-mask-icon" style="display:inline-block;width:${size}px;height:${size}px;background-color:currentColor;-webkit-mask-image:url(${url});-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;mask-image:url(${url});mask-size:contain;mask-repeat:no-repeat;mask-position:center;mask-mode:luminance;-webkit-mask-source-type:luminance;vertical-align:-3px;" aria-hidden="true"></span>`;
    }

    const path = ICON_LIB[name];
    if (!path) return ''; // unknown icon
    const fill = opts.fill || 'currentColor';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" aria-hidden="true">${path}</svg>`;
  }

  /* Get icon from emoji — fallback to original if no mapping */
  function getIconFromEmoji(emoji, opts) {
    const name = EMOJI_MAP[emoji];
    if (!name) return null;
    return getIcon(name, opts);
  }

  /* Auto-replace emoji inside elements matching selector
     ใช้ตอน DOMContentLoaded เพื่อแทน <span class="sb-ico">🏠</span> เป็น SVG */
  function autoReplaceIcons(selector, opts) {
    document.querySelectorAll(selector).forEach(el => {
      const text = (el.textContent || '').trim();
      const svg = getIconFromEmoji(text, opts);
      if (svg) {
        el.innerHTML = svg;
        el.classList.add('has-svg-icon');
      }
    });
  }

  /* Expose globally */
  window.IconLib = { ICON_LIB, EMOJI_MAP, getIcon, getIconFromEmoji, autoReplaceIcons };
})();
