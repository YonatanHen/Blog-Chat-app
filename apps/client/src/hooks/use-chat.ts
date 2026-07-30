import { ChatMessageSchema, type ChatMessage } from '@blog/zod-shared'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { chatApi } from '../api/chat.js'
import { DEBUG } from '../lib/constants.js'
import { queryKeys } from '../lib/query-client.js'

// Optional — mirrors ChatMessage.author in zod-shared; a session need not hold a username.
export type ChatUser = { id: string; username?: string }
export type ChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed'

export function useChat() {
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([])
  const [online, setOnline] = useState<ChatUser[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [status, setStatus] = useState<ChatStatus>('connecting')
  // Set by the server's error event or local schema validation; cleared on each new attempt.
  const [sendError, setSendError] = useState<string | null>(null)

  // Held in a ref, created once. Creating it during render would open a
  // connection per render — the shape of the legacy chat.jsx:57 defect.
  const socketRef = useRef<Socket | null>(null)
  if (socketRef.current === null) {
    socketRef.current = io({ autoConnect: false, transports: ['websocket'] })
  }

  // Loads the last 50 messages over REST so the room shows recent context
  // instead of an empty box. Fired independently of the socket connect below
  // — the ordering guarantee is about how messages are *presented* (buffer
  // oldest-first, then live), not about serializing the fetch before the
  // socket connects. A failed fetch must not break the room: it just leaves
  // `bufferQuery.data` undefined and live messages still work.
  //
  // This is a one-time, mount-time snapshot, not a live view of "the last 50"
  // — the merge below treats `bufferQuery.data` as the whole buffered portion
  // on every render, it does not accumulate across refetches. The app's global
  // defaults (`staleTime: 5min`, refetch on focus/reconnect) are right for the
  // rest of the app but wrong here: the endpoint always returns only the
  // *current* CHAT_BUFFER_SIZE, so a background refetch after the user has
  // been in the room a while (tab away 5+ minutes, come back) would swap
  // messages 1-50 for whatever is now the last 50 and silently drop history
  // the user is already reading. Disabling refetch here — not globally — keeps
  // the buffer a snapshot taken once at open; live messages carry the
  // transcript forward from there.
  const bufferQuery = useQuery({
    queryKey: queryKeys.chat.messages,
    queryFn: () => chatApi.messages(),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Must not refetch during a visit (staleTime above) nor be reused across visits (gcTime).
    gcTime: 0,
  })

  useEffect(() => {
    if (DEBUG && bufferQuery.isError) console.warn('[CHAT] failed to load message history')
  }, [bufferQuery.isError])

  // Buffer first (already oldest-first from the server), then live messages
  // in arrival order. Deduping by id here — rather than at arrival time —
  // is what makes a duplicate impossible instead of merely unlikely: a
  // message that lands in both the fetched buffer and a live 'message'
  // event (the fetch-in-flight race) is only ever added once, regardless of
  // which of the two resolves first.
  const messages = useMemo(() => {
    const seen = new Set<string>()
    const merged: ChatMessage[] = []
    for (const message of [...(bufferQuery.data ?? []), ...liveMessages]) {
      if (seen.has(message.id)) continue
      seen.add(message.id)
      merged.push(message)
    }
    return merged
  }, [bufferQuery.data, liveMessages])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    const onConnect = () => setStatus('connected')
    const onDisconnect = () => setStatus('reconnecting')
    const onConnectError = () => setStatus('failed')
    const onMessage = (message: ChatMessage) => setLiveMessages((prev) => [...prev, message])
    const onPresence = ({ users }: { users: ChatUser[] }) => setOnline(users)
    // No fallback name — a username-less typer is omitted, not fabricated.
    const onTyping = ({ username, typing }: { username?: string; typing: boolean }) => {
      if (!username) return
      setTypingUsers((prev) =>
        typing ? [...new Set([...prev, username])] : prev.filter((u) => u !== username),
      )
    }
    const onError = ({ message }: { message: string }) => {
      if (DEBUG) console.warn('[CHAT] rejected', message)
      setSendError(message)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('message', onMessage)
    socket.on('presence', onPresence)
    socket.on('typing', onTyping)
    socket.on('error', onError)
    socket.connect()

    // Every `on` above has an `off` here. The legacy chat.jsx:51 grew its
    // listener count with the conversation because it had no cleanup.
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('message', onMessage)
      socket.off('presence', onPresence)
      socket.off('typing', onTyping)
      socket.off('error', onError)
      socket.disconnect()
    }
  }, [])

  const send = useCallback((body: string): boolean => {
    setSendError(null)
    const parsed = ChatMessageSchema.safeParse({ body })
    if (!parsed.success) {
      setSendError(parsed.error.errors[0]?.message ?? 'Invalid message')
      return false
    }
    // Body only. The author is stamped server-side from the session.
    socketRef.current?.emit('message', { body: parsed.data.body })
    return true
  }, [])

  const setTyping = useCallback((typing: boolean) => {
    socketRef.current?.emit('typing', { typing })
  }, [])

  return { messages, online, typingUsers, status, send, setTyping, sendError }
}
