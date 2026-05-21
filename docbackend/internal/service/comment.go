package service

import (
	"net/http"
	"strconv"

	"github.com/7as0nch/mimo2codex/docbackend/internal/biz"
	"github.com/7as0nch/mimo2codex/docbackend/internal/conf"
)

type CommentService struct {
	uc  *biz.CommentUsecase
	sec *conf.Security
}

func NewCommentService(uc *biz.CommentUsecase, sec *conf.Security) *CommentService {
	return &CommentService{uc: uc, sec: sec}
}

type submitCommentReq struct {
	Body string `json:"body"`
	// ClientID identifies the browser (UUID from localStorage). Optional.
	ClientID string `json:"clientId,omitempty"`
}

// HandleByIdea dispatches POST/GET on /api/ideas/{id}/comments.
func (s *CommentService) HandleByIdea(w http.ResponseWriter, r *http.Request, ideaID uint) {
	switch r.Method {
	case http.MethodPost:
		s.handleSubmit(w, r, ideaID)
	case http.MethodGet:
		s.handleList(w, r, ideaID)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func (s *CommentService) handleSubmit(w http.ResponseWriter, r *http.Request, ideaID uint) {
	var req submitCommentReq
	if err := decodeJSON(r, &req, 8<<10); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json: " + err.Error()})
		return
	}
	id, err := s.uc.Submit(r.Context(), biz.SubmitCommentInput{
		IdeaID:   ideaID,
		Body:     req.Body,
		IPHash:   IPHash(r, s.sec.IPSalt),
		ClientID: clientIDFrom(r, req.ClientID),
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]uint{"id": id})
}

func (s *CommentService) handleList(w http.ResponseWriter, r *http.Request, ideaID uint) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	size, _ := strconv.Atoi(r.URL.Query().Get("size"))

	// Header carries the clientId for GET requests (body would be unusual).
	// Used to flag rows posted by THIS browser as `mine=true` in the response.
	clientID := clientIDFrom(r, "")

	items, total, err := s.uc.List(r.Context(), ideaID, page, size, clientID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"total": total,
		"items": items,
	})
}
