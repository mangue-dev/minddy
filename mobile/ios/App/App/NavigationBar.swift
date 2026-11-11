import UIKit

/// The app's bottom bar: a capsule of Liquid Glass with one button per action.
///
/// The web app owns what the bar holds and where it sits. It keeps its own bar
/// in the page, invisible, and reports that bar's place, its buttons and
/// whether anything covers it (`lib/mobile/native-navigation.ts`). This view
/// draws the same bar natively at that place, with the page's own icons, and
/// sends each tap back, so a button always does what its web twin does.
final class NavigationBar: UIView {
    struct Item: Equatable {
        let id: String
        let label: String
        let badge: Bool
        /// The web button's own icon, as PNG data, with its pixels per point.
        var icon: Data?
        var iconScale: CGFloat = 1
        /// False for a picture (the account's avatar), which keeps its colors.
        var iconTinted = true
    }

    /// Called with the identifier of the tapped item.
    var onSelect: ((String) -> Void)?

    private let background: UIVisualEffectView
    private let stack = UIStackView()
    private var items: [Item] = []
    private let feedback = UISelectionFeedbackGenerator()

    /// What stands in for an item whose icon the page did not send.
    private static let fallbackSymbols: [String: String] = [
        "home": "house",
        "assistant": "sparkles",
        "search": "magnifyingglass",
        "create": "plus",
        "menu": "person.crop.circle"
    ]

    override init(frame: CGRect) {
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect()
            glass.isInteractive = true
            background = UIVisualEffectView(effect: glass)
        } else {
            background = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        }
        super.init(frame: frame)

        background.frame = bounds
        background.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(background)

        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.frame = bounds
        stack.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        background.contentView.addSubview(stack)

        alpha = 0
        isHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if #available(iOS 26.0, *) {
            background.cornerConfiguration = .capsule()
        } else {
            background.layer.cornerRadius = bounds.height / 2
            background.layer.cornerCurve = .continuous
            background.clipsToBounds = true
        }
    }

    var hasItems: Bool { !items.isEmpty }

    func update(items newItems: [Item]) {
        guard newItems != items else { return }
        items = newItems
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (index, item) in newItems.enumerated() {
            stack.addArrangedSubview(button(for: item, at: index))
        }
    }

    func setVisible(_ visible: Bool) {
        guard visible == isHidden else { return }
        if visible { isHidden = false }
        UIView.animate(withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .curveEaseOut], animations: {
            self.alpha = visible ? 1 : 0
        }, completion: { _ in
            // A newer change may have reversed this one while it ran.
            if self.alpha == 0 { self.isHidden = true }
        })
    }

    private func button(for item: Item, at index: Int) -> UIButton {
        let button = UIButton(type: .system)
        // The page's own icon when it sent one, so the bar wears the same
        // icons as the rest of the product.
        let image = item.icon.flatMap { UIImage(data: $0, scale: item.iconScale) }?
            .withRenderingMode(item.iconTinted ? .alwaysTemplate : .alwaysOriginal)
            ?? UIImage(
                systemName: Self.fallbackSymbols[item.id] ?? "circle",
                withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)
            )
        button.setImage(image, for: .normal)
        button.imageView?.contentMode = .scaleAspectFit
        button.tintColor = .label
        button.accessibilityLabel = item.label
        button.tag = index
        button.addTarget(self, action: #selector(itemTapped(_:)), for: .touchUpInside)

        if item.badge {
            let dot = UIView()
            dot.backgroundColor = .systemBlue
            dot.layer.cornerRadius = 4
            dot.isUserInteractionEnabled = false
            dot.translatesAutoresizingMaskIntoConstraints = false
            button.addSubview(dot)
            NSLayoutConstraint.activate([
                dot.widthAnchor.constraint(equalToConstant: 8),
                dot.heightAnchor.constraint(equalToConstant: 8),
                dot.centerXAnchor.constraint(equalTo: button.centerXAnchor, constant: 12),
                dot.centerYAnchor.constraint(equalTo: button.centerYAnchor, constant: -10)
            ])
        }
        return button
    }

    @objc private func itemTapped(_ sender: UIButton) {
        guard items.indices.contains(sender.tag) else { return }
        feedback.selectionChanged()
        onSelect?(items[sender.tag].id)
    }
}
