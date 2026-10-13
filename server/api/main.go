package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const defaultPort = "9999"
const maxUploadBytes = int64(5) << 30

type App struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
	IconURL     string `json:"iconUrl"`
	ApkURL      string `json:"apkUrl"`
	CreatedAt   string `json:"createdAt"`
}

type server struct {
	dataFile   string
	uploadsDir string
	webDir     string
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (s *server) readApps() []App {
	data, err := os.ReadFile(s.dataFile)
	if err != nil {
		return []App{}
	}
	var apps []App
	if err := json.Unmarshal(data, &apps); err != nil || apps == nil {
		return []App{}
	}
	return apps
}

func (s *server) writeApps(apps []App) error {
	data, err := json.MarshalIndent(apps, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(s.dataFile, data, 0o644)
}

func uniqueName(original string) string {
	base := filepath.Base(original)
	if base == "." || base == string(filepath.Separator) || base == "" {
		base = "file"
	}
	return fmt.Sprintf("%d-%d-%s", time.Now().UnixMilli(), rand.IntN(1000000), base)
}

func (s *server) saveUpload(file multipart.File, original string) (string, error) {
	name := uniqueName(original)
	dest, err := os.Create(filepath.Join(s.uploadsDir, name))
	if err != nil {
		return "", err
	}
	defer dest.Close()
	if _, err := io.Copy(dest, file); err != nil {
		return "", err
	}
	return name, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleApps(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.readApps())
	case http.MethodPost:
		s.handleCreate(w, r)
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *server) handleCreate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Upload konnte nicht verarbeitet werden."})
		return
	}

	name := strings.TrimSpace(r.FormValue("name"))
	version := strings.TrimSpace(r.FormValue("version"))
	description := strings.TrimSpace(r.FormValue("description"))
	icon, iconHeader, iconErr := r.FormFile("icon")
	apk, apkHeader, apkErr := r.FormFile("apk")

	if name == "" || version == "" || description == "" || iconErr != nil || apkErr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "name, version, description, icon und apk sind erforderlich.",
		})
		return
	}
	defer icon.Close()
	defer apk.Close()

	iconName, err := s.saveUpload(icon, iconHeader.Filename)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Icon konnte nicht gespeichert werden."})
		return
	}
	apkName, err := s.saveUpload(apk, apkHeader.Filename)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "APK konnte nicht gespeichert werden."})
		return
	}

	entry := App{
		ID:          fmt.Sprintf("%d-%d", time.Now().UnixMilli(), rand.IntN(1000000)),
		Name:        name,
		Version:     version,
		Description: description,
		IconURL:     "/uploads/" + iconName,
		ApkURL:      "/uploads/" + apkName,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}

	apps := s.readApps()
	apps = append(apps, entry)
	if err := s.writeApps(apps); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "App konnten nicht gespeichert werden."})
		return
	}

	writeJSON(w, http.StatusCreated, entry)
}

func (s *server) handleUnknownAPI(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

var mimeTypes = map[string]string{
	".html":        "text/html; charset=utf-8",
	".js":          "text/javascript; charset=utf-8",
	".mjs":         "text/javascript; charset=utf-8",
	".css":         "text/css; charset=utf-8",
	".json":        "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".map":         "application/json; charset=utf-8",
	".txt":         "text/plain; charset=utf-8",
	".ico":         "image/x-icon",
	".png":         "image/png",
	".jpg":         "image/jpeg",
	".jpeg":        "image/jpeg",
	".gif":         "image/gif",
	".svg":         "image/svg+xml",
	".webp":        "image/webp",
	".avif":        "image/avif",
	".woff":        "font/woff",
	".woff2":       "font/woff2",
	".ttf":         "font/ttf",
	".otf":         "font/otf",
}

func contentType(filePath string) string {
	if ct, ok := mimeTypes[strings.ToLower(filepath.Ext(filePath))]; ok {
		return ct
	}
	return "application/octet-stream"
}

func cacheControl(filePath string) string {
	switch filepath.Base(filePath) {
	case "index.html", "ngsw-worker.js", "ngsw.json", "safety-worker.js":
		return "no-cache"
	default:
		return "public, max-age=3600"
	}
}

func (s *server) serveStatic(w http.ResponseWriter, r *http.Request, filePath string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "500 Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", contentType(filePath))
	w.Header().Set("Cache-Control", cacheControl(filePath))
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	_, _ = w.Write(data)
}

// handleSPA liefert die Angular-App aus. Unbekannte Pfade bekommen index.html
// (Client-Routing), damit ein Direktaufruf wie /newApp ebenfalls funktioniert.
func (s *server) handleSPA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "405 Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	cleaned := filepath.Clean("/" + r.URL.Path)
	filePath := filepath.Join(s.webDir, cleaned)
	if !strings.HasPrefix(filePath, s.webDir) {
		http.Error(w, "403 Forbidden", http.StatusForbidden)
		return
	}

	if info, err := os.Stat(filePath); err == nil && info.IsDir() {
		filePath = filepath.Join(filePath, "index.html")
	}

	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		s.serveStatic(w, r, filePath)
		return
	}

	s.serveStatic(w, r, filepath.Join(s.webDir, "index.html"))
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func resolveDataDir() string {
	if dir := strings.TrimSpace(os.Getenv("DATA_DIR")); dir != "" {
		return dir
	}
	wd, err := os.Getwd()
	if err != nil {
		log.Fatalf("Arbeitsverzeichnis konnte nicht ermittelt werden: %v", err)
	}
	return wd
}

func resolveWebDir() string {
	if dir := strings.TrimSpace(os.Getenv("WEB_DIR")); dir != "" {
		return dir
	}
	candidates := []string{
		filepath.Join("dist", "leon-app-store", "browser"),
		filepath.Join("..", "dist", "leon-app-store", "browser"),
		filepath.Join("..", "..", "dist", "leon-app-store", "browser"),
	}
	for _, dir := range candidates {
		if fileExists(filepath.Join(dir, "index.html")) {
			return dir
		}
	}
	return candidates[0]
}

func main() {
	root := resolveDataDir()

	s := &server{
		dataFile:   filepath.Join(root, "apps.json"),
		uploadsDir: filepath.Join(root, "uploads"),
		webDir:     resolveWebDir(),
	}

	if err := os.MkdirAll(s.uploadsDir, 0o755); err != nil {
		log.Fatalf("Uploads-Verzeichnis konnte nicht erstellt werden: %v", err)
	}
	if !fileExists(s.dataFile) {
		if err := os.WriteFile(s.dataFile, []byte("[]\n"), 0o644); err != nil {
			log.Fatalf("apps.json konnte nicht erstellt werden: %v", err)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/api/apps", s.handleApps)
	mux.HandleFunc("/api/", s.handleUnknownAPI)
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.uploadsDir))))
	mux.HandleFunc("/", s.handleSPA)

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	log.Printf("AppStore-Server läuft auf http://localhost:%s", port)
	log.Printf("Frontend: %s", s.webDir)
	log.Printf("Datenverzeichnis: %s", root)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		log.Fatalf("Server konnte nicht gestartet werden: %v", err)
	}
}
