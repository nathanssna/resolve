import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Lesson, LessonBlock } from '@/content/lessons';
import { supabase } from './supabase';

/** Ids das aulas que o profissional logado já concluiu. */
export async function lessonProgress(): Promise<string[]> {
  const { data, error } = await supabase.from('lesson_progress').select('lesson_id');
  if (error) throw error;
  return data.map((r) => r.lesson_id);
}

/** Registra a aula como concluída. `released`: com ela, o profissional acabou de ser liberado. */
export async function completeLesson(lessonId: string): Promise<{ done: number; total: number; released: boolean }> {
  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId });
  if (error) throw error;
  return data as unknown as { done: number; total: number; released: boolean };
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

/** Se a pessoa já viu, neste aparelho, a explicação de por que as aulas existem. */
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
