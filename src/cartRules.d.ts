export type Cart = Record<string, number>;
export type CartMenuItem = { id: string; price: number; is_available: boolean };
export function sanitizeCart(value: unknown): Cart;
export function restoreCart(serialized: string | null, now?: number): Cart;
export function serializeCart(cart: Cart, now?: number): string;
export function setCartItemQuantity(cart: Cart, itemId: string, quantity: number): Cart;
export function getUnavailableCartItems(cart: Cart, menu: CartMenuItem[]): [string, number][];
export function calculateCartTotal(cart: Cart, menu: CartMenuItem[]): number;
