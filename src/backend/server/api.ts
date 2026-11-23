import type { RequestMessage, SupportRequest, Topic, Update } from '../../../shared/api';
import { call } from './client';

// The server's /v1/ API for the app (students and guides). Staff use the website.

export type SupportOverview = { requests: SupportRequest[]; supervision_mode: 'all_requests' | 'reported_only' };
export type RequestDetail = { request: SupportRequest; messages: RequestMessage[]; thread_hidden: boolean };

export const loadSupport = () => call<SupportOverview>('GET', '/v1/support');
export const loadRequest = (id: string, after = 0) => call<RequestDetail>('GET', `/v1/support/requests/${id}?after=${after}`);

export const submitRequest = (topic: Topic, language: string | null, question: string) =>
  call<{ request: SupportRequest }>('POST', '/v1/support/requests', { topic, language, question }).then((r) => r.request);
export const sendMessage = (id: string, body: string) =>
  call<{ message: RequestMessage }>('POST', `/v1/support/requests/${id}/messages`, { body }).then((r) => r.message);
export const withdrawRequest = (id: string) => call('POST', `/v1/support/requests/${id}/withdraw`);
export const declineRequest = (id: string, reason: string | null) => call('POST', `/v1/support/requests/${id}/decline`, { reason });
export const markDone = (id: string, note: string | null) => call('POST', `/v1/support/requests/${id}/done`, { note });
export const reportRequest = (id: string, reason: string) => call('POST', `/v1/support/requests/${id}/report`, { reason });

export const loadUpdates = () => call<{ updates: Update[] }>('GET', '/v1/updates').then((r) => r.updates);
