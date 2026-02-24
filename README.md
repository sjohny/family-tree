# 🌳 Family Tree

A beautiful, self-hosted family tree web application. Built for Docker Hub + Dockge on TrueNAS.

## Features

- Visual family tree with generational layout and circular photo portraits
- Photo support via **Immich** URLs, **pCloud** public links, or any direct image URL
- Add / edit / delete family members and relationships (parent-child, spouse)
- Auto-computed siblings, detail panel with bio and dates
- Export / Import JSON, automatic backups (last 10 kept)
- Sample data loader, responsive design, multi-arch (amd64 + arm64)

---

## Setup: GitHub → Docker Hub → Dockge

### 1. Push this repo to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USER/family-tree.git
git push -u origin main
```

### 2. Add Docker Hub secrets to GitHub

Go to your repo → **Settings → Secrets and variables → Actions** → add:

| Secret name          | Value                                      |
|----------------------|--------------------------------------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username                   |
| `DOCKERHUB_TOKEN`    | A Docker Hub access token (not password)   |

To create a token: [hub.docker.com](https://hub.docker.com) → Account Settings → Security → New Access Token.

### 3. Push = auto-build

Every push to `main` triggers the GitHub Action which:
- Builds a multi-arch image (amd64 + arm64)
- Pushes to `your-username/family-tree:latest`
- Uses GitHub Actions cache for fast rebuilds

You can also tag releases:
```bash
git tag v1.0.0
git push --tags
```
This creates `:1.0.0` and `:1.0` tags on Docker Hub alongside `:latest`.

You can also trigger a build manually from the **Actions** tab.

### 4. Deploy in Dockge on TrueNAS

Create dataset:
```
/mnt/pool1/dockge/config/family-tree
```

In Dockge, create stack `family-tree` with:

```yaml
version: "3.8"

services:
  family-tree:
    image: YOUR_DOCKERHUB_USERNAME/family-tree:latest
    container_name: family-tree
    restart: unless-stopped
    ports:
      - "3080:3000"
    volumes:
      - /mnt/pool1/dockge/config/family-tree:/app/data
    environment:
      - NODE_ENV=production
      - DATA_DIR=/app/data
```

Click **Deploy**, then open `http://your-truenas-ip:3080`.

### 5. Update the app

```bash
# Make changes, commit, push
git add . && git commit -m "update" && git push
# Wait for GitHub Action to finish (~1-2 min)
# In Dockge: click "Pull & Redeploy"
```

---

## Photo URLs

| Source      | URL format                                                    |
|-------------|---------------------------------------------------------------|
| **Immich**  | `https://immich.yourdomain.com/api/assets/ASSET_ID/thumbnail` |
| **pCloud**  | `https://filedn.com/your-path/photo.jpg`                     |
| **Any URL** | Any direct link to `.jpg`, `.png`, `.webp`                    |

## Data

All data is stored in `/mnt/pool1/dockge/config/family-tree/family.json`. Backups are created automatically on every save (last 10 kept).

## API

| Method | Path                    | Description            |
|--------|-------------------------|------------------------|
| GET    | `/api/family`           | Get all data           |
| PUT    | `/api/settings`         | Update title/subtitle  |
| POST   | `/api/members`          | Add member             |
| PUT    | `/api/members/:id`      | Update member          |
| DELETE | `/api/members/:id`      | Delete member          |
| POST   | `/api/relationships`    | Add relationship       |
| DELETE | `/api/relationships/:id`| Delete relationship    |
| GET    | `/api/export`           | Download JSON          |
| POST   | `/api/import`           | Import JSON            |
