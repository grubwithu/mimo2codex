package service

import (
	"net/http"
	"strconv"

	"github.com/7as0nch/mimo2codex/docbackend/internal/biz"
	"github.com/7as0nch/mimo2codex/docbackend/internal/conf"
)

type IdeaService struct {
	uc  *biz.IdeaUsecase
	sec *conf.Security
}

func NewIdeaService(uc *biz.IdeaUsecase, sec *conf.Security) *IdeaService {
	return &IdeaService{uc: uc, sec: sec}
}

type submitIdeaReq struct {
	Title      string `json:"title"`
	Body       string `json:"body"`
	Background string `json:"background,omitempty"`
	Contact    string `json:"contact,omitempty"`
	Lang       string `json:"lang"`
	// ClientID is the browser-generated UUID stored in localStorage. Optional
	// but expected for any request made by the docweb frontend.
	ClientID string `json:"clientId,omitempty"`
}

func (s *IdeaService) HandleSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var req submitIdeaReq
	if err := decodeJSON(r, &req, 16<<10); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json: " + err.Error()})
		return
	}

	id, err := s.uc.Submit(r.Context(), biz.SubmitIdeaInput{
		Title:      req.Title,
		Body:       req.Body,
		Background: req.Background,
		Contact:    req.Contact,
		Lang:       req.Lang,
		IPHash:     IPHash(r, s.sec.IPSalt),
		ClientID:   clientIDFrom(r, req.ClientID),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]uint{"id": id})
}

// HandleGet returns a single public idea for the detail page. Wired from the
// router for /api/ideas/{id} (no trailing path) — the comments endpoint at
// /api/ideas/{id}/comments lives in CommentService.
func (s *IdeaService) HandleGet(w http.ResponseWriter, r *http.Request, id uint) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	idea, err := s.uc.GetPublic(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, idea)
}

func (s *IdeaService) HandleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	size, _ := strconv.Atoi(r.URL.Query().Get("size"))

	items, total, err := s.uc.ListPublic(r.Context(), page, size)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"total": total,
		"items": items,
	})
}
