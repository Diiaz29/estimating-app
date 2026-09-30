type IconName = 'warning' | 'copy' | 'check' | 'pen' | 'star' | 'close' | 'up' | 'down' | 'left' | 'right' | 'phone' | 'download' | 'calendar' | 'clock' | 'people' | 'settings' | 'dashboard' | 'folder' | 'register' | 'sort' | 'sun' | 'moon'

export default function UiIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    sort: 'M8 4v16m-4-4 4 4 4-4m4 4V4m-4 4 4-4 4 4',
    sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
    moon: 'M20 14A9 9 0 0 1 10 4a9 9 0 1 0 10 10Z',
    calendar: 'M4 5h16v16H4V5Zm0 5h16M8 3v4m8-4v4',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2',
    people: 'M9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3 21v-4a6 6 0 0 1 12 0v4m2-17a3 3 0 0 1 0 6m2 11v-4a6 6 0 0 0-2-4',
    settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
    dashboard: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
    folder: 'M3 5h7l2 3h9v13H3V5Z',
    register: 'M4 3h16v18H4V3Zm4 5h8M8 12h8m-8 4h5',
    warning: 'M12 3 2 21h20L12 3Zm0 6v5m0 3v.2',
    copy: 'M8 8h12v13H8V8ZM16 8V3H3v13h5',
    check: 'm5 12 4 4L19 6',
    pen: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 7 1-1Z',
    star: 'm12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9L12 3Z',
    close: 'm6 6 12 12M18 6 6 18',
    up: 'm6 15 6-6 6 6',
    down: 'm6 9 6 6 6-6',
    download: 'M12 3v12m-6-6 6 6 6-6M4 16v5h16v-5',
    left: 'm15 6-6 6 6 6',
    right: 'm9 6 6 6-6 6',
    phone: 'M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2Z',
  }
  return <svg className="ui-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
