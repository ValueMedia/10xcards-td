import type { SupportedLocale } from "./constants";

export const ui = {
  en: {
    "app.title": "10x Cards - TD",
    "banner.attention": "Attention:",
    "banner.docs": "Documentation",
    "nav.dashboard": "Dashboard",
    "nav.settings": "Settings",
    "nav.signout": "Sign out",
    "nav.signingOut": "Signing out...",
    "auth.signin": "Sign in",
    "auth.signup": "Sign up",
    "auth.noAccount": "Don't have an account?",
    "auth.hasAccount": "Already have an account?",
    "auth.registrationSuccessful": "Registration successful",
    "auth.registrationSuccessfulDesc": "Your account has been created. You can now sign in.",
    "auth.goToSignIn": "Go to sign in",
    "auth.checkYourEmail": "Check your email",
    "auth.checkYourEmailDesc":
      "We've sent a confirmation link to your email address. Click it to activate your account.",
    "auth.backToSignIn": "Back to sign in",
    "dashboard.title": "Dashboard",
    "settings.title": "Settings",
    "set.errorLoading": "Failed to load sets. Please try again later.",
    "config.supabaseNotConfigured": "Supabase is not configured — authentication features are disabled.",
    "config.setupInstructions": "Setup instructions",
  },
  pl: {
    "app.title": "10x Cards - TD",
    "banner.attention": "Uwaga:",
    "banner.docs": "Dokumentacja",
    "nav.dashboard": "Dashboard",
    "nav.settings": "Ustawienia",
    "nav.signout": "Wyloguj się",
    "nav.signingOut": "Wylogowywanie...",
    "auth.signin": "Zaloguj się",
    "auth.signup": "Zarejestruj się",
    "auth.noAccount": "Nie masz konta?",
    "auth.hasAccount": "Masz już konto?",
    "auth.registrationSuccessful": "Rejestracja zakończona",
    "auth.registrationSuccessfulDesc": "Twoje konto zostało utworzone. Możesz się teraz zalogować.",
    "auth.goToSignIn": "Przejdź do logowania",
    "auth.checkYourEmail": "Sprawdź swoją pocztę",
    "auth.checkYourEmailDesc": "Wysłaliśmy link potwierdzający na Twój adres email. Kliknij go, aby aktywować konto.",
    "auth.backToSignIn": "Wróć do logowania",
    "dashboard.title": "Dashboard",
    "settings.title": "Ustawienia",
    "set.errorLoading": "Nie udało się załadować zestawów. Spróbuj ponownie później.",
    "config.supabaseNotConfigured": "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
    "config.setupInstructions": "Zobacz instrukcję konfiguracji",
  },
} as const;

export function getTranslations(lang: SupportedLocale) {
  const langUi = ui[lang] as Record<string, string>;
  const enUi = ui.en as Record<string, string>;
  return function t(key: string): string {
    return langUi[key] || enUi[key] || key;
  };
}
