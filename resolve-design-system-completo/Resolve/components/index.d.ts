import type * as React from 'react';

export type IconName = 'wrench' | 'zap' | 'droplets' | 'laptop' | 'armchair' | 'hammer' | 'search' | 'map-pin' | 'chevron-right' | 'star' | 'heart' | 'share' | 'arrow-left' | 'arrow-right' | 'house' | 'message-circle' | 'user' | 'user-round' | 'shield-check' | 'check';

export interface IconProps { name: IconName; size?: number; strokeWidth?: number; fill?: 'none' | 'currentColor'; label?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'dark' | 'link'; block?: boolean; iconRight?: IconName; /** renders an <a> instead of a <button> */ href?: string }
export declare function Button(props: ButtonProps): React.ReactElement;

export interface SearchFieldProps { placeholder?: string; value?: string; defaultValue?: string; onChange?: React.ChangeEventHandler<HTMLInputElement> }
export declare function SearchField(props: SearchFieldProps): React.ReactElement;

export interface LocationPillProps { label?: string; value: string; onClick?: () => void }
export declare function LocationPill(props: LocationPillProps): React.ReactElement;

export interface CategoryTileProps { icon: IconName; label: string; active?: boolean; onClick?: () => void }
export declare function CategoryTile(props: CategoryTileProps): React.ReactElement;

export interface RatingProps { value: number; count?: number | string; suffix?: string; size?: number }
export declare function Rating(props: RatingProps): React.ReactElement;

export interface ServiceCardProps { icon: IconName; title: string; subtitle?: string; rating?: number; count?: number | string; href?: string; onClick?: () => void }
export declare function ServiceCard(props: ServiceCardProps): React.ReactElement;

export interface FilterChipProps { active?: boolean; onClick?: () => void; children: React.ReactNode }
export declare function FilterChip(props: FilterChipProps): React.ReactElement;

export interface TagProps { children: React.ReactNode }
export declare function Tag(props: TagProps): React.ReactElement;

export interface AvatarProps { size?: number; src?: string; alt?: string }
export declare function Avatar(props: AvatarProps): React.ReactElement;

export interface ProfessionalCardProps { name: string; rating: number; count?: number | string; distance?: string; role?: string; experience?: string; tags?: string[]; avatar?: string; href?: string; onClick?: () => void }
export declare function ProfessionalCard(props: ProfessionalCardProps): React.ReactElement;

export interface CheckItemProps { children: React.ReactNode }
export declare function CheckItem(props: CheckItemProps): React.ReactElement;

export interface InfoBannerProps { icon?: IconName; title: string; description?: string }
export declare function InfoBanner(props: InfoBannerProps): React.ReactElement;

export interface TopBarAction { icon: IconName; label: string; onClick?: () => void; href?: string; filled?: boolean }
export interface TopBarProps { title?: string; onBack?: (() => void) | false; backHref?: string; actions?: TopBarAction[] }
export declare function TopBar(props: TopBarProps): React.ReactElement;

export interface TabItem { id: string; label: string; icon: IconName }
export interface TabBarProps { items?: TabItem[]; active?: string; onChange?: (id: string) => void }
export declare function TabBar(props: TabBarProps): React.ReactElement;

declare global { interface Window { Resolve: { Icon: typeof Icon; Button: typeof Button; SearchField: typeof SearchField; LocationPill: typeof LocationPill; CategoryTile: typeof CategoryTile; Rating: typeof Rating; ServiceCard: typeof ServiceCard; FilterChip: typeof FilterChip; Tag: typeof Tag; Avatar: typeof Avatar; ProfessionalCard: typeof ProfessionalCard; CheckItem: typeof CheckItem; InfoBanner: typeof InfoBanner; TopBar: typeof TopBar; TabBar: typeof TabBar; iconNames: IconName[] } } }
