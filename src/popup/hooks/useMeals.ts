import { useCallback, useEffect, useState } from 'react'
import type { SavedMeal, ShoppingList } from '@/shared/types'
import { deleteMeal, getMeals, saveMeal, toggleFavorite } from '@/shared/storage'

export function useMeals() {
  const [meals, setMeals] = useState<SavedMeal[]>([])

  useEffect(() => {
    void getMeals().then(setMeals)
  }, [])

  const remember = useCallback(async (list: ShoppingList) => {
    await saveMeal(list)
    setMeals(await getMeals())
  }, [])

  const favorite = useCallback(async (listId: string) => {
    setMeals(await toggleFavorite(listId))
  }, [])

  const remove = useCallback(async (listId: string) => {
    setMeals(await deleteMeal(listId))
  }, [])

  return { meals, remember, favorite, remove }
}
