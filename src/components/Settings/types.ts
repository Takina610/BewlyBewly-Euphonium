export enum MenuType {
  General = 'General',
  DesktopAndDock = 'DesktopAndDock',
  Appearance = 'Appearance',
  BewlyPages = 'BewlyPages',
  Compatibility = 'Compatibility',
  BilibiliSettings = 'BilibiliSettings',
  Slacking = 'Slacking',
  About = 'About',
}

export enum BewlyPage {
  Home = 'Home',
  Search = 'Search',
  Video = 'Video',
  Moments = 'Moments',
  Live = 'Live',
}

export interface MenuItem {
  value: MenuType
  title: string
  icon: string
  iconActivated: string
}
