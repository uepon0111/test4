# プロセカ リザルト管理

プロジェクトセカイのリザルト画像をアップロード・管理できるWebアプリです。

## GitHub Pagesへのデプロイ

1. このリポジトリをGitHubにプッシュ
2. Settings → Pages → Source を `main` ブランチに設定

## 初期設定

### Google Drive連携（任意）

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. **APIs & Services** → **認証情報** → **OAuth 2.0クライアントID** を作成
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みのJavaScriptオリジン: `https://あなたのID.github.io`
3. アプリの **設定** ページでClient IDを入力・保存
4. **Googleでログイン** をクリックして認証

### OCRプロファイル設定

1. 設定 → **OCR読み取りプロファイル** → **プロファイルを追加**
2. プロファイル名を入力（例: iPhone15）
3. **画像を選択** でリザルト画像をアップロード
4. 色付き枠をドラッグして各読み取り範囲を調整:
   - 🔴 **赤**: タイトル
   - 🟢 **緑**: 難易度
   - 🔵 **青**: 楽曲レベル
   - 🟠 **橙**: リザルト（PERFECT/GREAT/GOOD/BAD/MISS）
   - 🟣 **紫**: コンボ数
5. **保存** → **選択** でアクティブに設定

## 主な機能

- 📷 リザルト画像の自動OCR読み取り（Tesseract.js）
- ☁️ Google Driveへの自動アップロード
- 🔍 楽曲名・読み方での検索
- 📊 AP基準 / AP大会基準 / FC基準でのミス数表示
- 📈 名前・レベル・ミス数・追加日での並び替え
- 🎯 難易度・レベル・達成状況・ミス数での絞り込み
- 🏆 自己ベスト更新時の通知
- 🗑️ ゴミ箱（3日後に自動完全削除）

## ミス数の定義

| モード | 計算式 |
|--------|--------|
| AP基準 | GREAT + GOOD + BAD + MISS |
| AP大会基準 | GREAT×1 + GOOD×2 + BAD×3 + MISS×3 |
| FC基準 | GOOD + BAD + MISS |

## 使用技術

- [Tesseract.js](https://github.com/naptha/tesseract.js) - ブラウザOCR
- [Google Identity Services](https://developers.google.com/identity) - OAuth2
- [Google Drive API v3](https://developers.google.com/drive/api) - クラウド保存
- [プロセカ楽曲DB](https://sekai-world.github.io/sekai-master-db-diff/) - 楽曲情報
