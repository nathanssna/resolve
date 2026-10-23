import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Lesson, LessonBlock } from '@/content/lessons';
import { supabase } from './supabase';

/** Ids das aulas que o profissional logado já concluiu. */
export async function lessonProgress(): Promise<string[]> {
  const { data, error } = await supabase.from('lesson_progress').select('lesson_id');
  if (error) throw error;
  return data.map((r) => r.lesson_id);
}

/** Situação de cada aula: quando concluiu e, se não passou nas perguntas, a partir de quando responde de novo. */
export type LessonStatus = { lesson_id: string; completed_at: string | null; retry_at: string | null };

export async function lessonStatus(): Promise<LessonStatus[]> {
  const { data, error } = await supabase.rpc('lesson_status');
  if (error) throw error;
  return data;
}

/** Perguntas de uma aula, sorteadas e embaralhadas pelo servidor (que sabe qual é a certa). */
export type LessonQuiz = {
  attempt_id: string;
  lesson_id: string;
  total: number;
  pass: number;
  questions: { question: string; options: string[] }[];
};

/** Resultado. `wrong`: posições das perguntas erradas; `gold`: acabou de virar Profissional de Ouro. */
export type LessonQuizResult = {
  score: number;
  total: number;
  pass: number;
  passed: boolean;
  wrong: number[];
  retry_at: string | null;
  done: number;
  lessons: number;
  gold: boolean;
};

/** Começa as perguntas (ou devolve as que ficaram em aberto, iguais). */
export async function startLessonQuiz(lessonId: string): Promise<LessonQuiz> {
  const { data, error } = await supabase.rpc('start_lesson_quiz', { p_lesson_id: lessonId });
  if (error) throw error;
  return data as unknown as LessonQuiz;
}

/** Envia as respostas: posição escolhida em cada pergunta. */
export async function submitLessonQuiz(attemptId: string, answers: number[]): Promise<LessonQuizResult> {
  const { data, error } = await supabase.rpc('submit_lesson_quiz', { p_attempt_id: attemptId, p_answers: answers });
  if (error) throw error;
  return data as unknown as LessonQuizResult;
}

export type Topic = { title: string; blocks: LessonBlock[] };

/** Divide a aula em tópicos pelos títulos ('h'); o que vem antes do primeiro é a abertura. */
export function topicsOf(lesson: Lesson): Topic[] {
  const topics: Topic[] = [{ title: 'Abertura', blocks: [] }];
  for (const b of lesson.blocks) {
    if (b.kind === 'h') topics.push({ title: b.text, blocks: [] });
    else topics[topics.length - 1].blocks.push(b);
  }
  return topics;
}

/** Onde a pessoa parou em cada aula (só neste aparelho): tópico aberto e até onde já leu. */
export type LessonSpot = { page: number; furthest: number };
const SPOT_KEY = 'resolve:lessons:spot';

export async function lessonSpots(): Promise<Record<string, LessonSpot>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SPOT_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

/** Grava (ou apaga, com `null`) o ponto em que a pessoa parou na aula. */
export async function saveLessonSpot(lessonId: string, spot: LessonSpot | null) {
  const spots = await lessonSpots();
  if (spot) spots[lessonId] = spot;
  else delete spots[lessonId];
  await AsyncStorage.setItem(SPOT_KEY, JSON.stringify(spots)).catch(() => {});
}

/** Se a pessoa já viu, neste aparelho, a explicação do Profissional de Ouro. */
const WHY_KEY = 'resolve:lessons:why-seen';

export async function lessonsWhySeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WHY_KEY)) === '1';
  } catch {
    return false;
  }
}

export function markLessonsWhySeen() {
  AsyncStorage.setItem(WHY_KEY, '1').catch(() => {});
}
