import { adresseDe } from '@/lib/adresses';

// L'adresse française d'une page (voir src/lib/adresses.js).
export function createPageUrl(pageName: string) {
    return '/' + adresseDe(pageName);
}
