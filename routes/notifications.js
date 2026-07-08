import express from 'express'
import mongoose from 'mongoose'
import Task from '../models/task.js'
import User from '../models/user.js'
import { protect } from '../middleware/auth.js'
import { sendPushNotification, createNotification, getNotificationsForUser, getNotification, updateNotification } from '../firebase.js'

const router = express.Router()

router.use(protect)

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const notifications = await getNotificationsForUser(req.user._id, isAdmin)
    // Populate task, project, sender fields manually if needed (assuming they are stored as IDs)
    // For simplicity, we return as stored; frontend may request details via other endpoints.
    res.json({ notifications })
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.', error: err.message })
  }
})

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const notifId = req.params.id
    // Mark as read in RTDB
    await updateNotification(notifId, { isRead: true })
    res.json({ message: 'Notification marquée comme lue.' })
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.', error: err.message })
  }
})

// PUT /api/notifications/:id/approve
router.put('/:id/approve', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut approuver la réouverture.' })
    }

    const notifId = req.params.id
    const notif = await getNotification(notifId)
    if (!notif) return res.status(404).json({ message: 'Notification introuvable.' })

    const task = await Task.findById(notif.task)
    if (!task) return res.status(404).json({ message: 'Tâche introuvable.' })

    const previousStatus = task.status
    const newStatus = 'in_progress'

    task.status = newStatus
    task.statusHistory.push({
      previousStatus,
      newStatus,
      changedBy: req.user._id,
      changedAt: new Date(),
      note: "Réouverture approuvée par l'administrateur."
    })

    task.comments.push({
      author: req.user._id,
      content: 'Demande de réouverture acceptée.'
    })

    await task.save()

    // Notifier le demandeur via RTDB and push
    if (notif.sender) {
      await createNotification({
        recipient: notif.sender.toString(),
        sender: req.user._id.toString(),
        task: task._id.toString(),
        project: task.project.toString(),
        type: 'APPROVE',
        message: `L'administrateur a approuvé votre demande de réouverture pour la tâche "${task.title}".`
      })

      const requester = await User.findById(notif.sender)
      if (requester && requester.fcmToken) {
        await sendPushNotification(
          requester.fcmToken,
          'Demande approuvée',
          `L'administrateur a approuvé votre demande de réouverture pour la tâche "${task.title}".`,
          { taskId: task._id.toString(), type: 'APPROVE', recipientId: requester._id.toString() }
        )
      }
    }

    // Mark original notification as read
    await updateNotification(notifId, { isRead: true })

    await task.populate('owner', 'name email')
    await task.populate('assignee', 'name email')
    await task.populate('project', 'name description')
    await task.populate('comments.author', 'name email')
    await task.populate('statusHistory.changedBy', 'name email')

    res.json({ message: 'Demande approuvée.', task })
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.', error: err.message })
  }
})

// PUT /api/notifications/:id/ignore
router.put('/:id/ignore', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut rejeter la réouverture.' })
    }

    const notifId = req.params.id
    const notif = await getNotification(notifId)
    if (!notif) return res.status(404).json({ message: 'Notification introuvable.' })

    const task = await Task.findById(notif.task)
    if (!task) return res.status(404).json({ message: 'Tâche introuvable.' })

    task.comments.push({
      author: req.user._id,
      content: 'Demande de réouverture ignorée.'
    })

    await task.save()

    // Notifier le demandeur via RTDB and push
    if (notif.sender) {
      await createNotification({
        recipient: notif.sender.toString(),
        sender: req.user._id.toString(),
        task: task._id.toString(),
        project: task.project.toString(),
        type: 'IGNORE',
        message: `L'administrateur a refusé votre demande de réouverture pour la tâche "${task.title}".`
      })

      const requester = await User.findById(notif.sender)
      if (requester && requester.fcmToken) {
        await sendPushNotification(
          requester.fcmToken,
          'Demande refusée',
          `L'administrateur a refusé votre demande de réouverture pour la tâche "${task.title}".`,
          { taskId: task._id.toString(), type: 'IGNORE', recipientId: requester._id.toString() }
        )
      }
    }

    // Mark original notification as read
    await updateNotification(notifId, { isRead: true })

    await task.populate('owner', 'name email')
    await task.populate('assignee', 'name email')
    await task.populate('project', 'name description')
    await task.populate('comments.author', 'name email')
    await task.populate('statusHistory.changedBy', 'name email')

    res.json({ message: 'Demande ignorée.', task })
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur.', error: err.message })
  }
})

export default router
