#!/bin/sh
# Build and publish to GitHub Pages (gh-pages branch).
set -e
VITE_BASE=/veil/ npm run build
cd dist && touch .nojekyll && git init -q -b gh-pages && git add -A && git commit -qm deploy
git push -qf git@github.com:luongs3/veil.git gh-pages && rm -rf .git
