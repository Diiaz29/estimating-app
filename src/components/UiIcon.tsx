type IconName = 'warning' | 'copy' | 'check' | 'pen' | 'star' | 'close' | 'up' | 'down' | 'left' | 'right' | 'phone' | 'download'

export default function UiIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
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
