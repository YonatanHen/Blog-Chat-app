import type { ChatMessage } from '@blog/zod-shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { DEBUG } from '../lib/constants.js'

export type ChatUser = { id: string; username: string }
export type ChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [online, setOnline] = useState<ChatUser[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [status, setStatus] = useState<ChatStatus>('connecting')

  // Held in a ref, created once. Creating it during render would open a
  // connection per render — the shape of the legacy chat.jsx:57 defect.
  const socketRef = useRef<Socket | null>(null)
  if (socketRef.current === null) {
    socketRef.current = io({ autoConnect: false, transports: ['websocket'] })
  }

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    const onConnect = () => setStatus('connected')
    const onDisconnect = () => setStatus('reconnecting')
    const onConnectError = () => setStatus('failed')
    const onMessage = (message: ChatMessage) => setMessages((prev) => [...prev, message])
    const onPresence = ({ users }: { users: ChatUser[] }) => setOnline(users)
    const onTyping = ({ username, typing }: { username: string; typing: boolean }) =>
      setTypingUsers((prev) =>
        typing ? [...new Set([...prev, username])] : prev.filter((u) => u !== username),
      )
    const onError = ({ message }: { message: string }) => {
      if (DEBUG) console.warn('[CHAT] rejected', message)
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

  const send = useCallback((body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return
    // Body only. The author is stamped server-side from the session.
    socketRef.current?.emit('message', { body: trimmed })
  }, [])

  const setTyping = useCallback((typing: boolean) => {
    socketRef.current?.emit('typing', { typing })
  }, [])

  return { messages, online, typingUsers, status, send, setTyping }
}
