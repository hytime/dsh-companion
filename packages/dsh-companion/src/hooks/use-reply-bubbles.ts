import { useEffect, useRef, useState } from 'react';
import type { SkillStatus } from '../contracts/skill-contract';

const TOAST_MS = 6000;

export interface ReplyBubbleState {
  title: string;
  message: string;
}

export interface ReplyBubbleOptions {
  status: SkillStatus;
  statusMessage?: string;
  buddyTitle?: string;
  buddyMessage?: string;
  latestReply?: string;
}

export function useReplyBubbles({ status, statusMessage, buddyTitle, buddyMessage, latestReply }: ReplyBubbleOptions) {
  const [toast, setToast] = useState<ReplyBubbleState | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [replyToast, setReplyToast] = useState<string | null>(null);
  const lastBuddyRef = useRef('');
  const lastStatusRef = useRef('');
  const lastReplyRef = useRef('');

  useEffect(() => {
    if (statusMessage === undefined || statusMessage === '') return;
    if (statusMessage === lastStatusRef.current) return;
    lastStatusRef.current = statusMessage;
    setStatusToast(statusMessage);
  }, [statusMessage]);

  useEffect(() => {
    if (buddyMessage === undefined || buddyMessage === '') return;
    if (buddyMessage === lastBuddyRef.current) return;
    if (status === 'connecting' || status === 'thinking' || status === 'replying') return;
    lastBuddyRef.current = buddyMessage;
    setStatusToast(null);
    setReplyToast(null);
    setToast({ title: buddyTitle !== undefined && buddyTitle !== '' ? buddyTitle : '提醒', message: buddyMessage });
  }, [buddyMessage, buddyTitle, status]);

  useEffect(() => {
    if (latestReply === undefined || latestReply === '') {
      if (lastReplyRef.current !== '') {
        lastReplyRef.current = '';
        setReplyToast(null);
      }
      return;
    }
    if (latestReply === lastReplyRef.current) return;
    lastReplyRef.current = latestReply;
    setToast(null);
    setStatusToast(null);
    setReplyToast(latestReply);
  }, [latestReply]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (statusToast === null) return;
    const timer = setTimeout(() => setStatusToast(null), TOAST_MS + 2000);
    return () => clearTimeout(timer);
  }, [statusToast]);

  useEffect(() => {
    if (replyToast === null) return;
    const timer = setTimeout(() => setReplyToast(null), TOAST_MS + 2000);
    return () => clearTimeout(timer);
  }, [replyToast]);

  const dismissToast = (): void => setToast(null);
  const dismissReply = (): void => {
    setReplyToast(null);
    setStatusToast(null);
  };
  return { toast, replyToast: replyToast ?? statusToast, dismissToast, dismissReply };
}
