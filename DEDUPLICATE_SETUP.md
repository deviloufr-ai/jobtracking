# 🧹 Server-side Deduplication Setup

Guide pour configurer la déduplication Supabase (Edge Function + Cron job).

## 1️⃣ Déployer l'Edge Function

### Option A: Avec Supabase CLI (Recommandé)

```bash
# Installer/mettre à jour Supabase CLI
npm install -g supabase

# Login à Supabase
supabase login

# Déployer la fonction
supabase functions deploy deduplicate-jobs

# Vérifier
supabase functions list
```

**Résultat:**
```
✓ Function deduplicate-jobs deployed
URL: https://[project-id].supabase.co/functions/v1/deduplicate-jobs
```

### Option B: Via Dashboard Supabase

1. Aller dans **Supabase Dashboard** → **Edge Functions**
2. Cliquer **Create a new function** → **deduplicate-jobs**
3. Copier-coller le contenu de `supabase/functions/deduplicate-jobs/index.ts`
4. **Deploy**

---

## 2️⃣ Tester la fonction (optionnel)

```bash
# Vérifier que ça marche avec curl
curl -X POST https://[project-id].supabase.co/functions/v1/deduplicate-jobs \
  -H "Authorization: Bearer [YOUR_SESSION_TOKEN]" \
  -H "Content-Type: application/json"
```

Ou utiliser le bouton **Settings → Données → Nettoyer doublons (serveur)** dans l'app.

---

## 3️⃣ Configurer le Cron Job (Automatique)

### Option A: Supabase Scheduler (Recommandé - 2025+)

Si ton projet Supabase a les **Scheduled Functions**, tu peux créer un schedule directement:

```bash
# Créer une fonction scheduled qui s'exécute chaque jour à 2h du matin
supabase functions deploy deduplicate-jobs --schedule "0 2 * * *"
```

### Option B: Cron Job externe (Railway, Vercel, GitHub Actions)

**GitHub Actions (Gratuit):**

Créer `.github/workflows/nightly-dedup.yml`:

```yaml
name: Nightly Deduplication

on:
  schedule:
    # Chaque jour à 2h du matin UTC
    - cron: '0 2 * * *'

jobs:
  deduplicate:
    runs-on: ubuntu-latest
    steps:
      - name: Call deduplicate Edge Function
        run: |
          curl -X POST https://${{ secrets.SUPABASE_PROJECT_ID }}.supabase.co/functions/v1/deduplicate-jobs \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

**Setup:**
1. Aller dans **GitHub** → **Settings → Secrets and variables → Actions**
2. Ajouter `SUPABASE_PROJECT_ID` et `SUPABASE_SERVICE_KEY`:
   ```
   SUPABASE_PROJECT_ID = [from Dashboard > Settings > API]
   SUPABASE_SERVICE_KEY = [from Dashboard > Settings > API > service_role key]
   ⚠️ ATTENTION: Ne jamais partager SERVICE_KEY publiquement
   ```
3. Commiter le fichier `.github/workflows/nightly-dedup.yml`

### Option C: Trigger Manuel (pour commencer)

Pour l'instant, le bouton dans **Settings → Données → Nettoyer doublons (serveur)** suffit.

---

## 📊 Monitoring

### Vérifier les exécutions Supabase

```bash
# Voir les logs de la fonction
supabase functions logs deduplicate-jobs

# Ou via Dashboard:
# Supabase → Functions → deduplicate-jobs → Logs
```

### Exemple de sortie réussie:

```
🔄 Deduplicating jobs for user: 123e4567-e89b-12d3-a456-426614174000
📦 Found 45 total jobs
🏢 Found 42 unique company/position combinations
🗑️  Found 3 duplicates to delete
✓ Deleted 3 duplicate jobs
```

---

## 🆘 Troubleshooting

### "401 Unauthorized"
→ Token expiré ou non valide
→ Re-login avec `supabase login`

### "Function not found"
→ L'Edge Function n'a pas été déployée
→ Exécuter `supabase functions deploy deduplicate-jobs`

### "Network error"
→ Vérifier que l'URL de Supabase est correcte
→ Vérifier la connexion internet

---

## 🎯 Récapitulatif

| Composant | Status | Action |
|-----------|--------|--------|
| **Edge Function** | ✅ Créée | Déployer via CLI |
| **Bouton UI** | ✅ Ajouté | Utilisable maintenant |
| **Cron Job** | ⏳ Optionnel | Configurer plus tard |

**Prochaines étapes:**
1. Déployer Edge Function (`supabase functions deploy deduplicate-jobs`)
2. Tester le bouton dans Settings
3. Configurer cron job pour nettoyage automatique

Questions? Vérifier les logs Supabase ou les erreurs dans la console du navigateur.
