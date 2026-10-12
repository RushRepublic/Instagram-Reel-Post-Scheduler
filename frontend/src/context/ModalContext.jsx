import { createContext, useContext, useState, useCallback } from "react";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [content, setContent] = useState(null);

  const openModal = useCallback((node) => setContent(() => node), []);
  const closeModal = useCallback(() => setContent(null), []);

  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      {content && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="modal-box">{content}</div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
