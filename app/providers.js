"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const PostsContext = createContext(null);

export function PostsProvider({ children }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getPosts()
      .then(setPosts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function addPost(input) {
    const created = await api.createPost(input);
    setPosts((p) => [created, ...p]);
    return created;
  }

  return (
    <PostsContext.Provider value={{ posts, loading, error, addPost }}>
      {children}
    </PostsContext.Provider>
  );
}

export function usePosts() {
  const ctx = useContext(PostsContext);
  if (!ctx) throw new Error("usePosts must be used within PostsProvider");
  return ctx;
}
