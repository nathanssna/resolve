import type { Database } from './database.types';
import { supabase } from './supabase';

/** Situação do teste de um serviço da ficha (RPC quiz_status). */
export type QuizStatus = Database['public']['Functions']['quiz_status']['Returns'][number];

/** Uma tentativa em andamento: questões já sorteadas e embaralhadas pelo servidor. */
export type QuizAttempt = {
  attempt_id: string;
  service_id: string;
  deadline_at: string;
  total: number;
  pass: number;
  questions: { question: string; source: string; options: string[] }[];
};

export type QuizResult = {
  score: number;
  total: number;
  pass: number;
  passed: boolean;
  late: boolean;
  released: boolean;
  retry_at: string | null;
};

export async function quizStatus(): Promise<QuizStatus[]> {
  const { data, error } = await supabase.rpc('quiz_status');
  if (error) throw error;
  return data;
}

/** Começa o teste (ou devolve o que está em andamento, com as mesmas questões). */
export async function startQuiz(serviceId: string): Promise<QuizAttempt> {
  const { data, error } = await supabase.rpc('start_quiz', { p_service_id: serviceId });
  if (error) throw error;
  return data as unknown as QuizAttempt;
}

/** Envia as respostas: posição escolhida em cada questão, ou -1 se ficou em branco. */
export async function submitQuiz(attemptId: string, answers: number[]): Promise<QuizResult> {
  const { data, error } = await supabase.rpc('submit_quiz', { p_attempt_id: attemptId, p_answers: answers });
  if (error) throw error;
  return data as unknown as QuizResult;
}
